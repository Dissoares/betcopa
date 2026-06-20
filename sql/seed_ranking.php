<?php
/**
 * Seed inteligente de ranking.
 * Uso: php sql/seed_ranking.php [--game=<id>]
 *
 * Atualiza nome/placar/valor dos usuários seed existentes.
 * Cria registros apenas se ainda não existirem para aquele jogo.
 */

require_once __DIR__ . '/../src/config.php';
require_once __DIR__ . '/../src/db.php';
require_once __DIR__ . '/../src/services/RankingSeedService.php';

$gameId = 0;
foreach ($argv as $arg) {
    if (preg_match('/^--game=(\d+)$/', $arg, $m)) {
        $gameId = (int) $m[1];
    }
}

$result = (new RankingSeedService(Database::connection()))->run($gameId);

if (!$result['ok']) {
    echo "ERRO: {$result['erro']}\n";
    exit(1);
}

echo "Jogos processados : {$result['jogos']}\n";
echo "Apostas atualizadas: {$result['atualizadas']}\n";
echo "Apostas criadas   : {$result['criadas']}\n";
echo "Concluído. Acesse /api/ranking para verificar.\n";
