<?php
/**
 * Busca placares ao vivo na API pública não-documentada da ESPN.
 * Sem autenticação, sem rate limit estrito.
 * Usada como fallback quando football-data.org não tem dados ao vivo.
 */
class EspnService
{
    private const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

    // Palavras-chave do liga_nome → slug ESPN
    private const LEAGUE_KEYWORDS = [
        'libertadores'   => 'conmebol.libertadores',
        'sudamericana'   => 'conmebol.sudamericana',
        'recopa'         => 'conmebol.recopa',
        'brasileirao'    => 'bra.1',
        'brasileiro'     => 'bra.1',
        'serie a'        => 'bra.1',
        'serie b'        => 'bra.2',
        'copa do brasil' => 'bra.copa',
        'premier'        => 'eng.1',
        'championship'   => 'eng.2',
        'champions'      => 'uefa.champions',
        'europa league'  => 'uefa.europa',
        'conference'     => 'uefa.europa.conf',
        'bundesliga'     => 'ger.1',
        'serie a ital'   => 'ita.1',
        'ligue 1'        => 'fra.1',
        'la liga'        => 'esp.1',
        'primera liga'   => 'esp.1',
        'eredivisie'     => 'ned.1',
        'primeira liga'  => 'por.1',
        'liga portugal'  => 'por.1',
        'copa america'   => 'conmebol.america',
        'world cup'      => 'fifa.world',
        'copa do mundo'  => 'fifa.world',
        'mls'            => 'usa.1',
    ];

    // Cache estático por requisição: "slug:date" => events[]
    private static array $cache = [];

    /**
     * Busca o placar de um jogo por nome dos times e data.
     * Retorna ['placar_real', 'status', 'status_api'] ou null se não encontrado.
     */
    public function findMatchScore(string $homeTeam, string $awayTeam, string $date, string $ligaNome = ''): ?array
    {
        $slugs = $this->guessLeagueSlugs($ligaNome);

        foreach ($slugs as $slug) {
            $events = $this->fetchEvents($slug, $date);
            foreach ($events as $event) {
                $comp = $event['competitions'][0] ?? null;
                if (!$comp) continue;

                $espnHome = $espnAway = null;
                foreach ($comp['competitors'] as $c) {
                    if (($c['homeAway'] ?? '') === 'home') $espnHome = $c;
                    if (($c['homeAway'] ?? '') === 'away') $espnAway = $c;
                }
                if (!$espnHome || !$espnAway) continue;

                $hn = $espnHome['team']['shortDisplayName'] ?? $espnHome['team']['displayName'] ?? '';
                $an = $espnAway['team']['shortDisplayName'] ?? $espnAway['team']['displayName'] ?? '';

                if ($this->teamsMatch($homeTeam, $hn) && $this->teamsMatch($awayTeam, $an)) {
                    return $this->normalize($comp);
                }
            }
        }

        return null;
    }

    // ── Normalização ─────────────────────────────────────────────

    private function normalize(array $comp): array
    {
        $statusType = $comp['status']['type'] ?? [];
        $statusName = $statusType['name'] ?? '';

        $espnHome = $espnAway = null;
        foreach ($comp['competitors'] as $c) {
            if (($c['homeAway'] ?? '') === 'home') $espnHome = $c;
            if (($c['homeAway'] ?? '') === 'away') $espnAway = $c;
        }

        $hs = isset($espnHome['score']) && $espnHome['score'] !== '' ? (int) $espnHome['score'] : null;
        $as = isset($espnAway['score']) && $espnAway['score'] !== '' ? (int) $espnAway['score'] : null;
        $placarReal = ($hs !== null && $as !== null) ? "{$hs}x{$as}" : null;

        [$localStatus, $statusApi] = $this->mapStatus($statusName);

        return [
            'placar_real' => $placarReal,
            'status'      => $localStatus,
            'status_api'  => $statusApi,
        ];
    }

    private function mapStatus(string $name): array
    {
        return match (true) {
            str_contains($name, 'FINAL') || $name === 'STATUS_FULL_TIME'
                => ['finalizado', 'FT'],
            $name === 'STATUS_HALFTIME'
                => ['encerrado', 'HT'],
            $name === 'STATUS_FIRST_HALF'
                => ['encerrado', '1H'],
            $name === 'STATUS_IN_PROGRESS', $name === 'STATUS_SECOND_HALF'
                => ['encerrado', '2H'],
            $name === 'STATUS_EXTRA_TIME' || $name === 'STATUS_EXTRA_TIME_HALF'
                => ['encerrado', 'ET'],
            $name === 'STATUS_PENALTY'
                => ['encerrado', 'P'],
            $name === 'STATUS_POSTPONED'
                => ['aberto', 'PST'],
            str_contains($name, 'CANCEL')
                => ['encerrado', 'CANC'],
            $name === 'STATUS_SUSPENDED' || $name === 'STATUS_ABANDONED'
                => ['encerrado', 'SUSP'],
            default
                => ['aberto', 'NS'],
        };
    }

    // ── HTTP / Cache ─────────────────────────────────────────────

    private function fetchEvents(string $slug, string $date): array
    {
        $key = "{$slug}:{$date}";
        if (array_key_exists($key, self::$cache)) return self::$cache[$key];

        try {
            $yyyymmdd = str_replace('-', '', $date);
            $data     = $this->get(self::BASE . "/{$slug}/scoreboard?dates={$yyyymmdd}");
            self::$cache[$key] = $data['events'] ?? [];
        } catch (\Throwable $e) {
            Logger::error('ESPN fetch failed', ['slug' => $slug, 'err' => $e->getMessage()]);
            self::$cache[$key] = [];
        }

        return self::$cache[$key];
    }

    private function get(string $url): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
            CURLOPT_SSL_VERIFYPEER => false,
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($err) throw new \RuntimeException("ESPN cURL error: {$err}");
        if ($code !== 200) {
            Logger::error('ESPN HTTP error', ['code' => $code, 'url' => $url]);
            return [];
        }

        return json_decode($body, true) ?? [];
    }

    // ── Helpers ──────────────────────────────────────────────────

    private function guessLeagueSlugs(string $ligaNome): array
    {
        $lower = mb_strtolower($ligaNome, 'UTF-8');
        $slugs = [];

        foreach (self::LEAGUE_KEYWORDS as $keyword => $slug) {
            if (str_contains($lower, $keyword)) {
                $slugs[$slug] = true;
            }
        }

        // Fallback genérico: ligas mais comuns quando sem mapeamento
        if (empty($slugs)) {
            return ['conmebol.libertadores', 'conmebol.sudamericana', 'bra.1', 'bra.2',
                    'eng.1', 'ita.1', 'esp.1', 'ger.1', 'fra.1', 'uefa.champions'];
        }

        return array_keys($slugs);
    }

    private function teamsMatch(string $a, string $b): bool
    {
        $normalize = function (string $s): string {
            $s   = mb_strtolower($s, 'UTF-8');
            $map = [
                'á'=>'a','à'=>'a','â'=>'a','ã'=>'a','ä'=>'a','å'=>'a',
                'é'=>'e','è'=>'e','ê'=>'e','ë'=>'e',
                'í'=>'i','ì'=>'i','î'=>'i','ï'=>'i',
                'ó'=>'o','ò'=>'o','ô'=>'o','õ'=>'o','ö'=>'o',
                'ú'=>'u','ù'=>'u','û'=>'u','ü'=>'u',
                'ç'=>'c','ñ'=>'n','ý'=>'y','ß'=>'ss',
            ];
            return strtr($s, $map);
        };

        $ca = preg_replace('/[^a-z0-9 ]/', '', $normalize($a));
        $cb = preg_replace('/[^a-z0-9 ]/', '', $normalize($b));

        if (trim($ca) === trim($cb)) return true;

        // Sem espaços: um contém o outro
        $sa = str_replace(' ', '', $ca);
        $sb = str_replace(' ', '', $cb);
        if ($sa && $sb && (str_contains($sa, $sb) || str_contains($sb, $sa))) return true;

        // Palavra significativa (>=4 chars) em comum
        $wordsA = array_filter(explode(' ', trim($ca)), fn($w) => strlen($w) >= 4);
        $wordsB = array_filter(explode(' ', trim($cb)), fn($w) => strlen($w) >= 4);

        foreach ($wordsA as $wa) {
            foreach ($wordsB as $wb) {
                if ($wa === $wb) return true;
                // Prefixo de 5 chars (ex: "indep" de "independiente")
                if (strlen($wa) >= 5 && strlen($wb) >= 5 && str_starts_with($wa, substr($wb, 0, 5))) return true;
                if (strlen($wa) >= 5 && strlen($wb) >= 5 && str_starts_with($wb, substr($wa, 0, 5))) return true;
            }
        }

        return false;
    }
}
