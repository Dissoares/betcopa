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

    /** POST /api/admin/import — importa fixtures da API-Football */
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

        $body     = json_decode(file_get_contents('php://input'), true) ?: [];
        $leagueId = (int) ($body['league_id'] ?? 71);
        $season   = (int) ($body['season']    ?? date('Y'));
        $next     = min(50, max(1, (int) ($body['next'] ?? 20)));

        $api      = new ApiFootballService($apiKey, $timezone);
        $fixtures = $api->fetchNextFixtures($leagueId, $season, $next);

        if (empty($fixtures)) {
            jsonResponse(['message' => 'Nenhum jogo encontrado para essa liga/temporada.', 'importados' => 0]);
            return;
        }

        $count = 0;
        foreach ($fixtures as $item) {
            $normalized = $api->normalize($item);
            $this->repository->upsertByApiId($normalized);
            $count++;
        }

        Logger::info('Import API-Football', ['league' => $leagueId, 'season' => $season, 'count' => $count]);
        jsonResponse(['message' => "{$count} jogo(s) importado(s) com sucesso.", 'importados' => $count]);
    }

    /** POST /api/admin/sync — sincroniza resultados de jogos finalizados */
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

        $api          = new ApiFootballService($apiKey, $timezone);
        $pendingGames = $this->repository->findPendingSync();

        if (empty($pendingGames)) {
            jsonResponse(['message' => 'Nenhum jogo pendente de sync.', 'atualizados' => 0]);
            return;
        }

        $updated = 0;
        foreach ($pendingGames as $game) {
            try {
                $item = $api->fetchFixtureById((int) $game['api_fixture_id']);
                if (!$item) continue;

                $normalized  = $api->normalize($item);
                $statusApi   = $normalized['status_api'];
                $statusLocal = $normalized['status'];

                if ($statusLocal === 'finalizado' && $normalized['placar_real']) {
                    // Jogo terminou — atualiza placar e processa apostas
                    $this->repository->updateResult((int) $game['id'], $normalized['placar_real']);
                    $this->bets->processResult((int) $game['id']);
                    $updated++;
                } elseif ($statusLocal === 'encerrado' && $game['status'] === 'aberto') {
                    // Jogo iniciou — fecha para novas apostas
                    $this->repository->updateStatus((int) $game['id'], 'encerrado', $statusApi);
                }
            } catch (Throwable $e) {
                Logger::error('Sync falhou para fixture ' . $game['api_fixture_id'], ['error' => $e->getMessage()]);
            }
        }

        Logger::info('Sync API-Football', ['atualizados' => $updated]);
        jsonResponse(['message' => "{$updated} resultado(s) sincronizado(s).", 'atualizados' => $updated]);
    }

    /** PUT /api/admin/jogos/{id} — edita um jogo */
    public function update(int $id): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $game = $this->repository->find($id);
        if (!$game) {
            jsonResponse(['error' => 'Jogo não encontrado'], 404);
            return;
        }

        $body = json_decode(file_get_contents('php://input'), true) ?: [];

        $dataHora = str_replace('T', ' ', $body['data_hora'] ?? $game['data_hora']);
        if (strlen($dataHora) === 16) $dataHora .= ':00';

        $data = [
            'time_casa'     => trim($body['time_casa'] ?? $game['time_casa']),
            'time_fora'     => trim($body['time_fora'] ?? $game['time_fora']),
            'bandeira_casa' => mb_substr(trim($body['bandeira_casa'] ?? $game['bandeira_casa']), 0, 10),
            'bandeira_fora' => mb_substr(trim($body['bandeira_fora'] ?? $game['bandeira_fora']), 0, 10),
            'data_hora'     => $dataHora,
            'valor_base'    => max(0.50, min(50.00, (float) ($body['valor_base'] ?? $game['valor_base']))),
            'status'        => $body['status'] ?? $game['status'],
        ];

        $this->repository->update($id, $data);
        Logger::info('Jogo atualizado', ['id' => $id]);
        jsonResponse(['message' => 'Jogo atualizado com sucesso']);
    }

    /** DELETE /api/admin/jogos/{id} — exclui um jogo */
    public function delete(int $id): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $game = $this->repository->find($id);
        if (!$game) {
            jsonResponse(['error' => 'Jogo não encontrado'], 404);
            return;
        }

        // Impedir exclusão de jogos com apostas pagas/confirmadas
        $betCount = $this->repository->countBets($id);
        if ($betCount > 0 && $game['status'] !== 'aberto') {
            jsonResponse(['error' => "Não é possível excluir: {$betCount} aposta(s) vinculada(s)."], 400);
            return;
        }

        $this->repository->delete($id);
        Logger::info('Jogo excluído', ['id' => $id]);
        jsonResponse(['message' => 'Jogo excluído com sucesso']);
    }
}
