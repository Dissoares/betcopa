<?php
/**
 * Seed: popula usuários de teste + apostas para a aba Ganhadores/Quase lá.
 * Uso: php sql/seed_ranking.php
 *
 * Pré-requisito: existir jogos com status='finalizado' e placar_real preenchido.
 */

require_once __DIR__ . '/../src/config.php';
require_once __DIR__ . '/../src/db.php';

$db = Database::connection();

// ── 1. Usuários seed ──────────────────────────────────────────
$seedUsers = [
    ['Carlos Silva',     'carlos.seed@betcopa.local'],
    ['Maria Oliveira',   'maria.seed@betcopa.local'],
    ['João Pereira',     'joao.seed@betcopa.local'],
    ['Ana Lima',         'ana.seed@betcopa.local'],
    ['Pedro Mendes',     'pedro.seed@betcopa.local'],
    ['Fernanda Costa',   'fernanda.seed@betcopa.local'],
    ['Lucas Rocha',      'lucas.seed@betcopa.local'],
    ['Beatriz Nunes',    'beatriz.seed@betcopa.local'],
    ['Ricardo Alves',    'ricardo.seed@betcopa.local'],
    ['Camila Ferreira',  'camila.seed@betcopa.local'],
];

$hash    = password_hash('betcopa123', PASSWORD_BCRYPT);
$chkUser = $db->prepare('SELECT id FROM users WHERE email = ?');
$insUser = $db->prepare('INSERT INTO users (nome, email, senha) VALUES (?, ?, ?)');

$userIds = [];
foreach ($seedUsers as [$nome, $email]) {
    $chkUser->execute([$email]);
    $id = $chkUser->fetchColumn();
    if (!$id) {
        $insUser->execute([$nome, $email, $hash]);
        $id = (int) $db->lastInsertId();
    }
    $userIds[] = (int) $id;
}
echo "Usuários prontos: " . count($userIds) . "\n";

// ── 2. Buscar jogos finalizados com placar ────────────────────
$games = $db->query(
    "SELECT id, time_casa, time_fora, placar_real, odd
       FROM jogos
      WHERE status = 'finalizado'
        AND placar_real IS NOT NULL
        AND placar_real != ''
      ORDER BY data_hora DESC
      LIMIT 12"
)->fetchAll(PDO::FETCH_ASSOC);

if (empty($games)) {
    echo "ERRO: Nenhum jogo finalizado com placar encontrado. Importe resultados primeiro.\n";
    exit(1);
}
echo "Jogos finalizados encontrados: " . count($games) . "\n";

// ── 3. Limpar apostas seed anteriores ────────────────────────
$ph = implode(',', array_fill(0, count($userIds), '?'));
$db->prepare("DELETE FROM apostas WHERE user_id IN ($ph)")->execute($userIds);

// ── 4. Montar e inserir apostas ───────────────────────────────
$insBet = $db->prepare(
    'INSERT INTO apostas (user_id, jogo_id, placar_casa, placar_fora, valor, odd, possivel_ganho, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);

$total = 0;

foreach ($games as $i => $g) {
    [$rc, $rf] = array_map('intval', explode('x', $g['placar_real']));
    $odd    = max((float) $g['odd'], 2.00);
    $gameId = (int) $g['id'];

    // Cada jogo tem um conjunto diferente de ganhadores/quase-lá
    // Rotaciona quais usuários ganham (índices 0-9, 2 ganhadores por jogo)
    $winIdx  = [($i * 2) % 10, ($i * 2 + 1) % 10];
    $nearIdx = [($i + 2) % 10, ($i + 3) % 10, ($i + 4) % 10, ($i + 5) % 10];

    // Ganhadores — acertaram o placar exato
    $valores = [50, 100, 30, 75, 20, 200, 15, 80, 40, 60];
    foreach ($winIdx as $j) {
        $val = $valores[$j];
        $ganho = round($val * $odd, 2);
        $insBet->execute([$userIds[$j], $gameId, $rc, $rf, $val, round($odd, 2), $ganho, 'ganhou']);
        $total++;
    }

    // Quase lá — 1 ou 2 gols de diferença
    $offsets = [
        [1, 0],   // +1 no time da casa
        [0, 1],   // +1 no time de fora
        [-1, 0],  // -1 no time da casa (mínimo 0)
        [1, 1],   // +1 em ambos
    ];
    foreach ($nearIdx as $k => $j) {
        [$oc, $of] = $offsets[$k];
        $pc    = max(0, $rc + $oc);
        $pf    = max(0, $rf + $of);
        $val   = $valores[$j];
        $ganho = round($val * $odd, 2);
        // Evita duplicar aposta já inserida como ganhador
        if ($pc === $rc && $pf === $rf) { $pc = ($pc + 1); }
        $insBet->execute([$userIds[$j], $gameId, $pc, $pf, $val, round($odd, 2), $ganho, 'perdido']);
        $total++;
    }
}

echo "Apostas inseridas: {$total}\n";
echo "Seed concluído. Acesse /api/ranking para verificar.\n";
