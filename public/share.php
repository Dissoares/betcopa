<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/db.php';
require_once __DIR__ . '/../src/repositories/GameRepository.php';

$id   = isset($_GET['id']) ? (int) $_GET['id'] : 0;
$game = null;

if ($id > 0) {
    $db   = Database::connection();
    $repo = new GameRepository($db);
    $game = $repo->find($id);
}

if (!$game) {
    header('Location: /');
    exit;
}

// Humanos recebem redirect direto; bots ficam para ler as OG tags
$ua    = $_SERVER['HTTP_USER_AGENT'] ?? '';
$isBot = (bool) preg_match(
    '/bot|crawl|spider|facebookexternalhit|Twitterbot|WhatsApp\/|Slackbot|TelegramBot|LinkedInBot|Pinterest|Discordbot/i',
    $ua
);

$liveCodes = ['1H', '2H', 'ET', 'BT', 'P', 'HT', 'LIVE', 'INT'];
$isLive    = in_array(strtoupper($game['status_api'] ?? ''), $liveCodes, true)
          || ($game['status'] === 'aberto' && strtotime($game['data_hora']) <= time());
$isFinal   = $game['status'] === 'finalizado';
$score     = !empty($game['placar_real']) ? str_replace('x', ' x ', $game['placar_real']) : null;

$proto  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$site   = $proto . '://' . ($_SERVER['HTTP_HOST'] ?? 'betcopa.online');

$casa = $game['time_casa'];
$fora = $game['time_fora'];

if ($isLive && $score) {
    $ogTitle = 'OLHA ESSE JOGO: ' . $casa . ' ' . $score . ' ' . $fora . ' agora!';
    $ogDesc  = 'Tá AO VIVO e ainda pode virar! Entra no BetCopa, faz teu palpite no resultado final e pode ganhar prêmio.';
} elseif ($isLive) {
    $ogTitle = $casa . ' × ' . $fora . ' AO VIVO — você tá vendo isso? 👀';
    $ogDesc  = 'Tá rolando agora! Entra no BetCopa e aposta no resultado. Dá pra ganhar prêmio se acertar o placar.';
} elseif ($isFinal && $score) {
    $ogTitle = 'Acertou o placar? ' . $casa . ' ' . $score . ' ' . $fora;
    $ogDesc  = 'Resultado saiu! Confira quem acertou e entre para apostar nos próximos jogos no BetCopa.';
} else {
    $dt   = new DateTime($game['data_hora']);
    $when = $dt->format('d/m \à\s H:i');
    $ogTitle = $casa . ' × ' . $fora . ' — você apostaria em quem?';
    $ogDesc  = 'Começa ' . $when . '. Entra no BetCopa, chuta o placar exato e pode ganhar prêmios reais!';
}

$ogImage = $site . '/og.php?id=' . $id;
$pageUrl = $site . '/share/game/' . $id;
$homeUrl = $site . '/';

$titleH = htmlspecialchars($ogTitle,  ENT_QUOTES, 'UTF-8');
$descH  = htmlspecialchars($ogDesc,   ENT_QUOTES, 'UTF-8');
$imgH   = htmlspecialchars($ogImage,  ENT_QUOTES, 'UTF-8');
$urlH   = htmlspecialchars($pageUrl,  ENT_QUOTES, 'UTF-8');
$homeH  = htmlspecialchars($homeUrl,  ENT_QUOTES, 'UTF-8');

if (!$isBot) {
    header('Location: ' . $homeUrl . '?jogo=' . $id, true, 302);
    exit;
}

header('Content-Type: text/html; charset=UTF-8');
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title><?= $titleH ?></title>
  <meta property="og:type"         content="website">
  <meta property="og:site_name"    content="BetCopa">
  <meta property="og:title"        content="<?= $titleH ?>">
  <meta property="og:description"  content="<?= $descH ?>">
  <meta property="og:url"          content="<?= $urlH ?>">
  <meta property="og:image"        content="<?= $imgH ?>">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type"   content="image/png">
  <meta property="og:locale"       content="pt_BR">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="<?= $titleH ?>">
  <meta name="twitter:description" content="<?= $descH ?>">
  <meta name="twitter:image"       content="<?= $imgH ?>">
  <meta http-equiv="refresh" content="0;url=<?= $homeH ?>?jogo=<?= $id ?>">
  <script>window.location.replace(<?= json_encode($homeUrl . '?jogo=' . $id) ?>);</script>
</head>
<body style="background:#080e1c;color:#fff;font-family:sans-serif;text-align:center;padding:2rem">
  <p>Redirecionando... <a href="<?= $homeH ?>?jogo=<?= $id ?>" style="color:#00C853">Clique aqui se não redirecionar</a></p>
</body>
</html>
