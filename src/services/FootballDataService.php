<?php
/**
 * Integração com football-data.org v4
 * Header: X-Auth-Token
 * Limite free: 10 req/min
 */
class FootballDataService
{
    private const BASE_URL = 'https://api.football-data.org/v4';

    // IDs de competição úteis
    public const COMPETITIONS = [
        2000 => 'Copa do Mundo FIFA',
        2001 => 'UEFA Champions League',
        2002 => 'Bundesliga',
        2003 => 'Eredivisie',
        2013 => 'Brasileirão Série A',
        2014 => 'La Liga',
        2015 => 'Ligue 1',
        2016 => 'Championship',
        2017 => 'Primeira Liga',
        2018 => 'Eredivisie',
        2019 => 'Serie A',
        2021 => 'Premier League',
        2152 => 'Copa América',
    ];

    private string $apiKey;
    private string $timezone;

    public function __construct(string $apiKey, string $timezone = 'America/Sao_Paulo')
    {
        $this->apiKey   = $apiKey;
        $this->timezone = $timezone;
    }

    // ── HTTP ─────────────────────────────────────────────────────
    private function get(string $endpoint, array $params = []): array
    {
        $url = self::BASE_URL . $endpoint;
        if ($params) $url .= '?' . http_build_query($params);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => [
                'X-Auth-Token: ' . $this->apiKey,
                'Accept: application/json',
            ],
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_HEADER         => true, // para ler rate-limit headers
        ]);

        $raw      = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $curlErr  = curl_error($ch);
        curl_close($ch);

        if ($curlErr) throw new RuntimeException('Erro de conexão: ' . $curlErr);

        $body = substr($raw, $headSize);

        if ($httpCode === 429) throw new RuntimeException('Rate limit atingido (10 req/min). Aguarde um momento.');
        if ($httpCode === 403) throw new RuntimeException('Token inválido ou competição fora do plano.');
        if ($httpCode !== 200) throw new RuntimeException("API respondeu HTTP {$httpCode}: {$body}");

        return json_decode($body, true) ?? [];
    }

    // ── Partidas ─────────────────────────────────────────────────
    /** Busca partidas de uma competição por status */
    public function fetchMatches(int $competitionId, ?string $status = null, ?int $matchday = null): array
    {
        $params = [];
        if ($status)   $params['status']   = $status;   // SCHEDULED,LIVE,IN_PLAY,PAUSED,FINISHED
        if ($matchday) $params['matchday']  = $matchday;

        $data = $this->get("/competitions/{$competitionId}/matches", $params);
        return $data['matches'] ?? [];
    }

    /** Busca uma partida pelo ID */
    public function fetchMatchById(int $matchId): ?array
    {
        $data = $this->get("/matches/{$matchId}");
        return empty($data) ? null : $data;
    }

    /** Busca partidas ao vivo de uma competição */
    public function fetchLiveMatches(int $competitionId): array
    {
        // IN_PLAY = em andamento | PAUSED = intervalo
        return $this->fetchMatches($competitionId, 'IN_PLAY,PAUSED');
    }

    // ── Normalização ─────────────────────────────────────────────
    /** Converte resposta da football-data.org para o formato do banco */
    public function normalize(array $match): array
    {
        $dt = new DateTime($match['utcDate']);
        $dt->setTimezone(new DateTimeZone($this->timezone));

        $apiStatus               = $match['status'];         // SCHEDULED, IN_PLAY, PAUSED, FINISHED …
        $minute                  = $match['minute'] ?? null;
        [$localStatus, $statusApi] = $this->mapStatus($apiStatus, $minute);

        // Placar: fullTime é preenchido em jogo e no final
        // No intervalo (PAUSED) fullTime fica null — usa halfTime como fallback
        $score = $match['score'] ?? [];
        $ft    = $score['fullTime'] ?? ['home' => null, 'away' => null];
        if ($ft['home'] === null && isset($score['halfTime']['home']) && $score['halfTime']['home'] !== null) {
            $ft = $score['halfTime'];
        }
        $placarReal = null;
        if ($ft['home'] !== null && $ft['away'] !== null) {
            $placarReal = $ft['home'] . 'x' . $ft['away'];
        }

        $homeTeam = $match['homeTeam'] ?? [];
        $awayTeam = $match['awayTeam'] ?? [];
        $comp     = $match['competition'] ?? [];

        return [
            'api_fixture_id' => $match['id'],
            'time_casa'      => $homeTeam['shortName'] ?? $homeTeam['name'] ?? '?',
            'time_fora'      => $awayTeam['shortName'] ?? $awayTeam['name'] ?? '?',
            'logo_casa'      => $homeTeam['crest'] ?? '',
            'logo_fora'      => $awayTeam['crest'] ?? '',
            'bandeira_casa'  => '',
            'bandeira_fora'  => '',
            'data_hora'      => $dt->format('Y-m-d H:i:s'),
            'liga_nome'      => $comp['name'] ?? '',
            'liga_logo'      => '',
            'estadio'        => $match['venue'] ?? '',
            'rodada'         => isset($match['matchday']) ? 'Rodada ' . $match['matchday'] : '',
            'status_api'     => $statusApi,
            'status'         => $localStatus,
            'placar_real'    => $placarReal,
            'odd'            => 1.00,
            'valor_base'     => 1.00,
        ];
    }

    // ── Helpers ──────────────────────────────────────────────────
    private function mapStatus(string $status, ?int $minute): array
    {
        return match ($status) {
            'SCHEDULED', 'TIMED' => ['aberto',    'NS'],
            'IN_PLAY'            => ['encerrado',  $this->minuteToCode($minute)],
            'PAUSED'             => ['encerrado',  'HT'],
            'FINISHED'           => ['finalizado', 'FT'],
            'AWARDED'            => ['finalizado', 'FT'],
            'SUSPENDED'          => ['encerrado',  'SUSP'],
            'POSTPONED'          => ['aberto',     'PST'],
            'CANCELLED'          => ['encerrado',  'CANC'],
            default              => ['aberto',     'NS'],
        };
    }

    private function minuteToCode(?int $minute): string
    {
        if ($minute === null) return 'LIVE';
        if ($minute <= 45)   return '1H';
        if ($minute <= 90)   return '2H';
        if ($minute <= 105)  return 'ET';
        return 'ET';
    }
}
