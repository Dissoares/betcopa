<?php
/**
 * cron/sync_live.php — Sincroniza placares ao vivo via football-data.org
 *
 * Linux:   * * * * * php /var/www/betcopa/cron/sync_live.php >> /var/log/betcopa.log 2>&1
 * Windows: schtasks /create /sc minute /mo 1 /tn "BetCopa Sync" /tr "php C:\laragon\www\betcopa\cron\sync_live.php"
 *
 * Limite free: 10 req/min — o script aguarda 7s entre chamadas (máx ~8 jogos/min).
 */
define('ROOT', dirname(__DIR__));

require_once ROOT . '/src/db.php';
require_once ROOT . '/src/services/FootballDataService.php';
require_once ROOT . '/src/repositories/GameRepository.php';
require_once ROOT . '/src/repositories/ConfigRepository.php';
require_once ROOT . '/src/logger.php';

$config     = require ROOT . '/src/config.php';
$pdo        = getPdo($config['db']);
$configRepo = new ConfigRepository($pdo);
$gameRepo   = new GameRepository($pdo);

$apiKey   = $configRepo->get('api_football_key',     $config['api_football']['key']      ?? '');
$timezone = $configRepo->get('api_football_timezone', $config['api_football']['timezone'] ?? 'America/Sao_Paulo');

if (empty($apiKey)) {
    echo "[" . date('H:i:s') . "] API key não configurada.\n";
    exit(1);
}

// Jogos em andamento (status=encerrado com status_api ao vivo) ou que já deveriam ter começado
$stmt = $pdo->query("
    SELECT id, api_fixture_id, status, status_api
    FROM jogos
    WHERE api_fixture_id IS NOT NULL
      AND (
        (status = 'encerrado' AND status_api IN ('1H','HT','2H','ET','BT','P','LIVE','INT'))
        OR
        (status = 'aberto' AND data_hora <= NOW())
      )
");
$toSync = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($toSync)) {
    echo "[" . date('H:i:s') . "] Nenhum jogo para sincronizar.\n";
    exit(0);
}

$api     = new FootballDataService($apiKey, $timezone);
$updated = 0;

foreach ($toSync as $game) {
    try {
        $match = $api->fetchMatchById((int) $game['api_fixture_id']);
        if (!$match) continue;

        $data        = $api->normalize($match);
        $statusLocal = $data['status'];
        $statusApi   = $data['status_api'];
        $placar      = $data['placar_real'];

        if ($statusLocal === 'finalizado' && $placar) {
            $pdo->prepare("UPDATE jogos SET status='finalizado', status_api=?, placar_real=? WHERE id=?")
                ->execute([$statusApi, $placar, $game['id']]);
            echo "[" . date('H:i:s') . "] #{$game['id']} FINALIZADO {$placar}\n";
        } else {
            $pdo->prepare("UPDATE jogos SET status=?, status_api=?, placar_real=COALESCE(?,placar_real) WHERE id=?")
                ->execute([$statusLocal, $statusApi, $placar, $game['id']]);
            echo "[" . date('H:i:s') . "] #{$game['id']} {$statusApi} " . ($placar ?? '—') . "\n";
        }

        $updated++;
        sleep(7); // respeita limite de 10 req/min
    } catch (Exception $e) {
        echo "[" . date('H:i:s') . "] Erro #{$game['id']}: " . $e->getMessage() . "\n";
    }
}

echo "[" . date('H:i:s') . "] Concluído: {$updated} atualizado(s).\n";
