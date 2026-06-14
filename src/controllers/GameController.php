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

    /** GET /api/jogos/live — retorna só os jogos em andamento e sincroniza placares */
    public function listLive(): void
    {
        $games        = $this->service->listGames();
        $tz           = new DateTimeZone($this->config['api_football']['timezone'] ?? 'America/Sao_Paulo');
        $now          = new DateTime('now', $tz);
        $liveApiCodes = ['1H','2H','ET','BT','P','HT','LIVE','INT'];

        $isLive = function (array $g) use ($now, $liveApiCodes): bool {
            if (in_array(strtoupper($g['status_api'] ?? ''), $liveApiCodes, true)) return true;
            if ($g['status'] !== 'aberto') return false;
            return (new DateTime($g['data_hora'])) <= $now;
        };

        $live = array_values(array_filter($games, $isLive));

        if (!empty($live)) {
            $this->autoSyncLive($live);
            // Re-fetch só os jogos ao vivo com dados atualizados
            $games = $this->service->listGames();
            $live  = array_values(array_filter($games, $isLive));
        }

        jsonResponse(['jogos' => $live]);
    }

    /**
     * Sincroniza placares dos jogos em andamento automaticamente.
     * Rate-limitado a 1 chamada a cada 90 s via arquivo de lock.
     * Retorna true se alguma atualização foi feita.
     */
    private function autoSyncLive(array $games): bool
    {
        if (empty($games)) return false;

        // Rate limit: no máximo 1 sync a cada 30 s
        $lock = sys_get_temp_dir() . '/betcopa_live_sync.lock';
        if (is_file($lock) && time() - (int) file_get_contents($lock) < 30) return false;
        file_put_contents($lock, time());

        $tz  = new DateTimeZone($this->config['api_football']['timezone'] ?? 'America/Sao_Paulo');
        $now = new DateTime('now', $tz);

        $apiKey   = $this->configRepo->get('api_football_key', $this->config['api_football']['key'] ?? '');
        $timezone = $this->configRepo->get('api_football_timezone', $this->config['api_football']['timezone'] ?? 'America/Sao_Paulo');
        $fdApi    = $apiKey ? new FootballDataService($apiKey, $timezone) : null;
        $espn     = new EspnService();
        $updated  = false;

        foreach (array_slice($games, 0, 5) as $game) {
            try {
                $norm = null;

                // 1) football-data.org (quando há api_fixture_id)
                if ($fdApi && !empty($game['api_fixture_id'])) {
                    try {
                        $match = $fdApi->fetchMatchById((int) $game['api_fixture_id']);
                        if ($match) $norm = $fdApi->normalize($match);
                    } catch (\Throwable $e) {
                        Logger::error('FD sync error', ['id' => $game['id'], 'err' => $e->getMessage()]);
                    }
                }

                // 2) ESPN fallback: sem dados ou API retornou NS para jogo que já começou
                $gameStarted = (new DateTime($game['data_hora'])) <= $now;
                if (!$norm || ($norm['status_api'] === 'NS' && $gameStarted)) {
                    $date     = (new DateTime($game['data_hora']))->format('Y-m-d');
                    $espnNorm = $espn->findMatchScore(
                        $game['time_casa'],
                        $game['time_fora'],
                        $date,
                        $game['liga_nome'] ?? ''
                    );
                    if ($espnNorm) {
                        $norm = $espnNorm;
                        Logger::info('ESPN fallback', [
                            'id'     => $game['id'],
                            'score'  => $espnNorm['placar_real'],
                            'status' => $espnNorm['status_api'],
                        ]);
                    }
                }

                if (!$norm) continue;

                if ($norm['status'] === 'finalizado' && $norm['placar_real']) {
                    $this->repository->updateResult((int) $game['id'], $norm['placar_real']);
                    $this->bets->processResult((int) $game['id']);
                    Logger::info('Auto-sync: finalizado', ['id' => $game['id'], 'placar' => $norm['placar_real']]);
                } else {
                    if ($norm['placar_real']) {
                        $this->repository->updateLiveScore((int) $game['id'], $norm['placar_real']);
                    }
                    $this->repository->updateStatus((int) $game['id'], $game['status'], $norm['status_api']);
                }
                $updated = true;
                usleep(150_000);
            } catch (\Throwable $e) {
                Logger::error('Auto-sync live', ['err' => $e->getMessage()]);
            }
        }

        return $updated;
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

    public function bulkResult(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $body       = json_decode(file_get_contents('php://input'), true) ?: [];
        $resultados = $body['resultados'] ?? [];

        if (!is_array($resultados) || empty($resultados)) {
            jsonResponse(['error' => 'Nenhum resultado fornecido.'], 400);
            return;
        }

        $processados = 0;
        $erros       = [];

        foreach ($resultados as $item) {
            $id   = (int) ($item['id']          ?? 0);
            $casa = (int) ($item['placar_casa'] ?? 0);
            $fora = (int) ($item['placar_fora'] ?? 0);

            if (!$id) { $erros[] = ['id' => $id, 'msg' => 'ID inválido']; continue; }

            try {
                $this->service->setResult($id, $casa, $fora);
                $this->bets->processResult($id);
                $processados++;
            } catch (Exception $e) {
                $erros[] = ['id' => $id, 'msg' => $e->getMessage()];
            }
        }

        Logger::info('Resultado em lote', ['processados' => $processados, 'erros' => count($erros)]);
        jsonResponse(['processados' => $processados, 'erros' => $erros]);
    }

    /** POST /api/admin/jogos/excluir/lote */
    public function bulkDelete(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        $ids  = array_filter(array_map('intval', $body['ids'] ?? []), fn($id) => $id > 0);

        if (empty($ids)) {
            jsonResponse(['error' => 'Nenhum jogo selecionado.'], 400);
            return;
        }

        $deleted = $this->repository->deleteMany(array_values($ids));
        $skipped = count($ids) - count($deleted);

        Logger::info('Exclusão em lote', ['excluidos' => count($deleted), 'ignorados' => $skipped]);
        jsonResponse([
            'message'  => count($deleted) . ' jogo(s) excluído(s).' . ($skipped > 0 ? " {$skipped} ignorado(s) (já finalizado(s))." : ''),
            'excluidos' => count($deleted),
        ]);
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

        $downloader = new ImageDownloaderService();
        $count = 0;
        foreach ($matches as $match) {
            $normalized = $api->normalize($match);

            // Baixa bandeiras e logos localmente
            $downloader->downloadFlag($normalized['bandeira_casa'] ?? '');
            $downloader->downloadFlag($normalized['bandeira_fora'] ?? '');
            if (!empty($normalized['logo_casa'])) {
                $local = $downloader->downloadLogo($normalized['logo_casa']);
                if ($local) $normalized['logo_casa'] = $local;
            }
            if (!empty($normalized['logo_fora'])) {
                $local = $downloader->downloadLogo($normalized['logo_fora']);
                if ($local) $normalized['logo_fora'] = $local;
            }

            $this->repository->upsertByApiId($normalized);
            $count++;
        }

        Logger::info('Import football-data.org', ['competition' => $competitionId, 'count' => $count]);
        jsonResponse(['message' => "{$count} partida(s) importada(s) com sucesso.", 'importados' => $count]);
    }

    /** POST /api/admin/sync-images — baixa/atualiza bandeiras e logos de todos os jogos */
    public function syncImages(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $games      = $this->repository->findAll();
        $downloader = new ImageDownloaderService();
        $flags      = 0;
        $logos      = 0;

        foreach ($games as $game) {
            // Bandeiras
            if (!empty($game['bandeira_casa'])) {
                $r = $downloader->downloadFlag($game['bandeira_casa']);
                if ($r) $flags++;
            }
            if (!empty($game['bandeira_fora'])) {
                $r = $downloader->downloadFlag($game['bandeira_fora']);
                if ($r) $flags++;
            }

            // Logos (só baixa se ainda for URL externa)
            $lH = $game['logo_casa'] ?? '';
            $lA = $game['logo_fora'] ?? '';
            $newH = (!empty($lH) && !str_starts_with($lH, '/assets/')) ? $downloader->downloadLogo($lH) : $lH;
            $newA = (!empty($lA) && !str_starts_with($lA, '/assets/')) ? $downloader->downloadLogo($lA) : $lA;

            if (($newH !== $lH || $newA !== $lA) && ($newH || $newA)) {
                $this->repository->updateLogos((int) $game['id'], $newH ?: $lH, $newA ?: $lA);
                $logos++;
            }
        }

        Logger::info('Sync de imagens', ['bandeiras' => $flags, 'logos' => $logos]);
        jsonResponse([
            'message' => "Sincronização concluída: {$flags} bandeira(s), {$logos} logo(s) de times atualizados.",
            'bandeiras' => $flags,
            'logos'     => $logos,
        ]);
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
