<?php
class ApiFootballService
{
    private const BASE_URL = 'https://v3.football.api-sports.io';

    private const STATUS_ABERTO    = ['NS', 'TBD'];
    private const STATUS_ENCERRADO = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'SUSP', 'INT', 'CANC', 'ABD', 'PST'];
    private const STATUS_FINALIZADO = ['FT', 'AET', 'PEN', 'AWD', 'WO'];

    public const LEAGUES = [
        71  => 'Brasileirão Série A',
        73  => 'Copa do Brasil',
        72  => 'Brasileirão Série B',
        13  => 'Copa Libertadores',
        1   => 'Copa do Mundo FIFA',
        9   => 'Copa América',
        2   => 'UEFA Champions League',
        3   => 'UEFA Europa League',
    ];

    private string $apiKey;
    private string $timezone;

    public function __construct(string $apiKey, string $timezone = 'America/Sao_Paulo')
    {
        $this->apiKey = $apiKey;
        $this->timezone = $timezone;
    }

    // ── HTTP ──────────────────────────────────────────────────
    private function get(string $endpoint, array $params = []): array
    {
        $url = self::BASE_URL . $endpoint;
        if ($params) {
            $url .= '?' . http_build_query($params);
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => [
                'x-apisports-key: ' . $this->apiKey,
                'Accept: application/json',
            ],
        ]);

        $raw    = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error  = curl_error($ch);
        curl_close($ch);

        if ($error) {
            throw new RuntimeException('Erro de conexão com a API: ' . $error);
        }
        if ($status === 499 || $status === 0) {
            throw new RuntimeException('API key inválida ou sem conexão.');
        }
        if ($status !== 200) {
            throw new RuntimeException("API respondeu HTTP {$status}");
        }

        $data = json_decode($raw, true);

        // Verifica limite de requisições
        $remaining = $data['results'] ?? null;
        if (isset($data['errors']) && !empty($data['errors'])) {
            $err = is_array($data['errors']) ? implode(', ', $data['errors']) : (string) $data['errors'];
            throw new RuntimeException('Erro da API: ' . $err);
        }

        return $data['response'] ?? [];
    }

    // ── Fixtures ──────────────────────────────────────────────
    /**
     * Busca os próximos N jogos de uma liga/temporada.
     */
    public function fetchNextFixtures(int $leagueId, int $season, int $next = 20): array
    {
        return $this->get('/fixtures', [
            'league' => $leagueId,
            'season' => $season,
            'next'   => $next,
        ]);
    }

    /**
     * Busca jogos finalizados de uma liga/temporada (para sync de resultados).
     */
    public function fetchFinishedFixtures(int $leagueId, int $season): array
    {
        return $this->get('/fixtures', [
            'league' => $leagueId,
            'season' => $season,
            'status' => 'FT-AET-PEN',
        ]);
    }

    /**
     * Busca um jogo específico pelo fixture_id da API.
     */
    public function fetchFixtureById(int $fixtureId): ?array
    {
        $result = $this->get('/fixtures', ['id' => $fixtureId]);
        return $result[0] ?? null;
    }

    // ── Normalização ──────────────────────────────────────────
    /**
     * Converte um item da resposta da API no formato do banco.
     */
    public function normalize(array $item): array
    {
        $fixture = $item['fixture'];
        $teams   = $item['teams'];
        $goals   = $item['goals'];
        $league  = $item['league'];
        $score   = $item['score'];

        // Converte timestamp UTC para horário de Brasília
        $dt = new DateTime('@' . $fixture['timestamp']);
        $dt->setTimezone(new DateTimeZone($this->timezone));

        $statusShort = $fixture['status']['short'] ?? 'NS';
        $statusLocal = $this->mapStatus($statusShort);

        // Placar real apenas se o jogo terminou
        $placarReal = null;
        if (in_array($statusShort, self::STATUS_FINALIZADO, true)) {
            $ft = $score['fulltime'];
            if ($ft['home'] !== null && $ft['away'] !== null) {
                $placarReal = $ft['home'] . 'x' . $ft['away'];
            } elseif ($goals['home'] !== null) {
                $placarReal = $goals['home'] . 'x' . $goals['away'];
            }
        }

        return [
            'api_fixture_id' => $fixture['id'],
            'time_casa'      => $teams['home']['name'],
            'time_fora'      => $teams['away']['name'],
            'bandeira_casa'  => '',
            'bandeira_fora'  => '',
            'logo_casa'      => $teams['home']['logo'] ?? '',
            'logo_fora'      => $teams['away']['logo'] ?? '',
            'data_hora'      => $dt->format('Y-m-d H:i:s'),
            'liga_nome'      => $league['name'],
            'liga_logo'      => $league['logo'] ?? '',
            'estadio'        => $fixture['venue']['name'] ?? '',
            'rodada'         => $league['round'] ?? '',
            'status_api'     => $statusShort,
            'status'         => $statusLocal,
            'placar_real'    => $placarReal,
            'odd'            => 1.00,
            'valor_base'     => 1.00,
        ];
    }

    private function mapStatus(string $apiStatus): string
    {
        if (in_array($apiStatus, self::STATUS_FINALIZADO, true)) {
            return 'finalizado';
        }
        if (in_array($apiStatus, self::STATUS_ENCERRADO, true)) {
            return 'encerrado';
        }
        return 'aberto';
    }
}
