<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/db.php';
require_once __DIR__ . '/../src/repositories/BetRepository.php';
require_once __DIR__ . '/../src/repositories/GameRepository.php';

$id  = isset($_GET['id']) ? (int) $_GET['id'] : 0;
$bet = null;

if ($id > 0) {
    $db      = Database::connection();
    $betRepo = new BetRepository($db);
    $bet     = $betRepo->find($id);
}

if (!$bet) {
    header('Location: /');
    exit;
}

$gameRepo = new GameRepository(Database::connection());
$game     = $gameRepo->find((int) $bet['jogo_id']);

if (!$game) {
    header('Location: /');
    exit;
}

$ua    = $_SERVER['HTTP_USER_AGENT'] ?? '';
$isBot = (bool) preg_match(
    '/bot|crawl|spider|facebookexternalhit|Twitterbot|WhatsApp\/|Slackbot|TelegramBot|LinkedInBot|Pinterest|Discordbot/i',
    $ua
);

$proto  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$site   = $proto . '://' . ($_SERVER['HTTP_HOST'] ?? 'betcopa.online');

$casa      = $game['time_casa'];
$fora      = $game['time_fora'];
$scoreCasa = (int) $bet['placar_casa'];
$scoreFora = (int) $bet['placar_fora'];
$liga      = $game['liga_nome'] ?? '';

$ogTitle = "Chutei {$scoreCasa} × {$scoreFora} em {$casa} × {$fora}! E você, qual seria?";
$ogDesc  = ($liga ? "[$liga] " : '') . "Será que acerto o placar? Entra no BetCopa, faz o seu palpite e pode ganhar prêmio se acertar!";

$ogImage = $site . '/og-bet.php?id=' . $id;
$pageUrl = $site . '/share/bet/' . $id;
$homeUrl = $site . '/';
$gameUrl = $homeUrl . '?jogo=' . $game['id'];

$titleH = htmlspecialchars($ogTitle,  ENT_QUOTES, 'UTF-8');
$descH  = htmlspecialchars($ogDesc,   ENT_QUOTES, 'UTF-8');
$imgH   = htmlspecialchars($ogImage,  ENT_QUOTES, 'UTF-8');
$urlH   = htmlspecialchars($pageUrl,  ENT_QUOTES, 'UTF-8');
$gameH  = htmlspecialchars($gameUrl,  ENT_QUOTES, 'UTF-8');

if (!$isBot) {
    header('Location: ' . $gameUrl, true, 302);
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
  <meta http-equiv="refresh" content="0;url=<?= $gameH ?>">
  <script>window.location.replace(<?= json_encode($gameUrl) ?>);</script>
</head>
<body style="background:#080e1c;color:#fff;font-family:sans-serif;text-align:center;padding:2rem">
  <p>Redirecionando... <a href="<?= $gameH ?>" style="color:#00C853">Clique aqui se não redirecionar</a></p>
</body>
</html>
