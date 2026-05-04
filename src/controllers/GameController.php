<?php
class GameController
{
    private GameService $service;
    private GameRepository $repository;
    private BetService $bets;
    private ConfigRepository $configRepo;
    private array $config;
    private string $adminEmail;

    public function __construct(GameService $service, GameRepository $repository, BetService $bets, ConfigRepository $configRepo, array $config)
    {
        $this->service    = $service;
        $this->repository = $repository;
        $this->bets       = $bets;
        $this->configRepo = $configRepo;
        $this->config     = $config;
        $this->adminEmail = $this->configRepo->get('admin_email', $this->config['admin_email']);
    }

    public function list(): void
    {
        jsonResponse(['jogos' => $this->service->listGames()]);
    }

    public function create(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);
        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        $id   = $this->service->createGame($body);
        jsonResponse(['id' => $id], 201);
    }

    public function update(int $id): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);
        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        $this->service->updateGame($id, $body);
        jsonResponse(['message' => 'Jogo atualizado.']);
    }

    public function result(int $id): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);
        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        $casa = (int) ($body['placar_casa'] ?? 0);
        $fora = (int) ($body['placar_fora'] ?? 0);
        $this->service->setResult($id, $casa, $fora);
        $this->bets->processResult($id);
        jsonResponse(['message' => 'Resultado inserido e apostas processadas']);
    }

    /** DELETE /api/admin/jogos/:id */
    public function delete(int $id): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $game = $this->repository->find($id);
        if (!$game) {
            jsonResponse(['error' => 'Jogo não encontrado.'], 404);
            return;
        }
        if ($game['status'] === 'finalizado') {
            jsonResponse(['error' => 'Não é possível excluir um jogo já finalizado.'], 422);
            return;
        }

        $this->repository->delete($id);
        Logger::info('Jogo excluído', ['id' => $id]);
        jsonResponse(['message' => 'Jogo excluído com sucesso.']);
    }

    /** POST /api/admin/import — importa partidas da football-data.org */
    public function import(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $apiKey   = $this->configRepo->get('api_football_key', $this->config['api_football']['key'] ?? '');
        $timezone = $this->configRepo->get('api_football_timezone', $this->config['api_football']['timezone'] ?? 'America/Sao_Paulo');
        if (empty($apiKey)) {
            jsonResponse(['error' => 'API key não configurada. Atualize em Configurações.'], 400);
            return;
        }

        $body         = json_decode(file_get_contents('php://input'), true) ?: [];
        $competitionId = (int) ($body['league_id'] ?? 2000); // 2000 = Copa do Mundo
        $status        = $body['status'] ?? 'SCHEDULED,TIMED'; // SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED

        $api = new FootballDataService($apiKey, $timezone);
        try {
            $matches = $api->fetchMatches($competitionId, $status);
        } catch (RuntimeException $e) {
            jsonResponse(['error' => $e->getMessage()], 400);
            return;
        }

        if (empty($matches)) {
            jsonResponse(['message' => 'Nenhuma partida encontrada para esta competição/status.', 'importados' => 0]);
            return;
        }

        $count = 0;
        foreach ($matches as $match) {
            $normalized = $api->normalize($match);
            $this->repository->upsertByApiId($normalized);
            $count++;
        }

        Logger::info('Import football-data.org', ['competition' => $competitionId, 'count' => $count]);
        jsonResponse(['message' => "{$count} partida(s) importada(s) com sucesso.", 'importados' => $count]);
    }

    /** POST /api/admin/sync — sincroniza placares e status via football-data.org */
    public function sync(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $apiKey   = $this->configRepo->get('api_football_key', $this->config['api_football']['key'] ?? '');
        $timezone = $this->configRepo->get('api_football_timezone', $this->config['api_football']['timezone'] ?? 'America/Sao_Paulo');
        if (empty($apiKey)) {
            jsonResponse(['error' => 'API key não configurada. Atualize em Configurações.'], 400);
            return;
        }

        $api          = new FootballDataService($apiKey, $timezone);
        $pendingGames = $this->repository->findPendingSync();

        if (empty($pendingGames)) {
            jsonResponse(['message' => 'Nenhum jogo pendente de sync.', 'atualizados' => 0]);
            return;
        }

        $updated = 0;
        foreach ($pendingGames as $game) {
            try {
                $match = $api->fetchMatchById((int) $game['api_fixture_id']);
                if (!$match) continue;

                $normalized  = $api->normalize($match);
                $statusApi   = $normalized['status_api'];
                $statusLocal = $normalized['status'];

                if ($statusLocal === 'finalizado' && $normalized['placar_real']) {
                    $this->repository->updateResult((int) $game['id'], $normalized['placar_real']);
                    $this->bets->processResult((int) $game['id']);
                    $updated++;
                } elseif ($statusLocal === 'encerrado') {
                    // Ao vivo ou encerrado — atualiza status e placar parcial
                    $this->repository->updateStatus((int) $game['id'], $statusLocal, $statusApi);
                    if ($normalized['placar_real']) {
                        $this->repository->updateLiveScore((int) $game['id'], $normalized['placar_real']);
                    }
                }

                usleep(100_000); // 100ms entre req (limite: 10/min)
            } catch (Throwable $e) {
                Logger::error('Sync falhou para match ' . $game['api_fixture_id'], ['error' => $e->getMessage()]);
            }
        }

        Logger::info('Sync football-data.org', ['atualizados' => $updated]);
        jsonResponse(['message' => "{$updated} resultado(s) sincronizado(s).", 'atualizados' => $updated]);
    }
}
