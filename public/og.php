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
    http_response_code(404);
    exit;
}

$liveCodes = ['1H', '2H', 'ET', 'BT', 'P', 'HT', 'LIVE', 'INT'];
$isLive    = in_array(strtoupper($game['status_api'] ?? ''), $liveCodes, true)
          || ($game['status'] === 'aberto' && strtotime($game['data_hora']) <= time());
$isFinal   = $game['status'] === 'finalizado';

$cacheTTL  = $isFinal ? PHP_INT_MAX : ($isLive ? 60 : 3600);
$cacheDir  = __DIR__ . '/assets/og-cache';
$cacheVer  = filemtime(__FILE__); // bust cache whenever og.php is updated
$cacheFile = $cacheDir . '/game-' . $id . '-' . $cacheVer . '.png';

if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTTL) {
    header('Content-Type: image/png');
    header('Cache-Control: public, max-age=300');
    header('X-OG-Cache: HIT');
    readfile($cacheFile);
    exit;
}

if (!function_exists('imagecreatetruecolor')) {
    http_response_code(500);
    exit;
}

$W = 1200;
$H = 630;

$img     = imagecreatetruecolor($W, $H);
$cBg     = imagecolorallocate($img, 8,   14,  28);
$cCard   = imagecolorallocate($img, 13,  22,  37);
$cGreen  = imagecolorallocate($img, 0,   200, 83);
$cWhite  = imagecolorallocate($img, 255, 255, 255);
$cGray   = imagecolorallocate($img, 107, 114, 128);
$cYellow = imagecolorallocate($img, 255, 215, 0);
$cRed    = imagecolorallocate($img, 239, 68,  68);
$cBorder = imagecolorallocate($img, 28,  35,  51);

imagefill($img, 0, 0, $cBg);
imagefilledrectangle($img, 60, 60, $W - 60, $H - 60, $cCard);
imagerectangle($img, 60, 60, $W - 60, $H - 60, $cBorder);
imagefilledrectangle($img, 0, 0,      $W, 6,   $cGreen);
imagefilledrectangle($img, 0, $H - 6, $W, $H,  $cGreen);

$ttf = null;
foreach ([
    __DIR__ . '/assets/fonts/font.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/arial.ttf',
] as $f) {
    if (file_exists($f)) { $ttf = $f; break; }
}

$score = !empty($game['placar_real']) ? str_replace('x', ' x ', $game['placar_real']) : null;
$home  = mb_strtoupper((string) $game['time_casa'], 'UTF-8');
$away  = mb_strtoupper((string) $game['time_fora'], 'UTF-8');

if ($isLive) {
    $badge = $score ? 'AO VIVO — ' . $score : 'AO VIVO AGORA';
    $bClr  = $cRed;
} elseif ($isFinal) {
    $badge = $score ? 'ENCERRADO — ' . $score : 'ENCERRADO';
    $bClr  = $cGray;
} else {
    $dt    = new DateTime($game['data_hora']);
    $badge = 'VAI COMECAR — ' . $dt->format('d/m H:i');
    $bClr  = $cGreen;
}

$cta = $isLive
    ? 'QUEM VAI GANHAR? APOSTE AGORA EM BETCOPA.ONLINE'
    : ($isFinal ? 'APOSTE NOS PROXIMOS JOGOS EM BETCOPA.ONLINE' : 'FACA SEU PALPITE E GANHE EM BETCOPA.ONLINE');

$hasTTF = $ttf && function_exists('imagettftext');

if ($hasTTF) {
    $cx = function(string $text, int $y, float $size, $color) use ($img, $ttf, $W): void {
        $bb = imagettfbbox($size, 0, $ttf, $text);
        $tw = (int) abs($bb[4] - $bb[0]);
        imagettftext($img, $size, 0, (int)(($W - $tw) / 2), $y, $color, $ttf, $text);
    };

    // Badge with colored background box
    $bbBadge = imagettfbbox(22, 0, $ttf, $badge);
    $twBadge = (int) abs($bbBadge[4] - $bbBadge[0]);
    $thBadge = (int) abs($bbBadge[1] - $bbBadge[7]);
    $bPadX   = 20; $bPadY = 10;
    $bX1     = (int)(($W - $twBadge) / 2) - $bPadX;
    $bY1     = 118;
    $bX2     = $bX1 + $twBadge + $bPadX * 2;
    $bY2     = $bY1 + $thBadge + $bPadY * 2;
    $cBadgeBg = $isLive
        ? imagecolorallocate($img, 50, 8,  8)
        : ($isFinal ? imagecolorallocate($img, 20, 22, 32) : imagecolorallocate($img, 5, 28, 10));
    imagefilledrectangle($img, $bX1, $bY1, $bX2, $bY2, $cBadgeBg);
    imagerectangle($img,       $bX1, $bY1, $bX2, $bY2, $bClr);
    imagettftext($img, 22, 0, $bX1 + $bPadX, $bY1 + $bPadY + $thBadge, $bClr, $ttf, $badge);

    // BetCopa brand (top-left)
    imagettftext($img, 22, 0, 90, 95, $cGreen, $ttf, 'BetCopa');

    // Team names
    $bbH   = imagettfbbox(52, 0, $ttf, $home);
    $twH   = (int) abs($bbH[4] - $bbH[0]);
    $homeX = max(90, (int)($W / 2 - 140 - $twH));
    imagettftext($img, 52, 0, $homeX, 310, $cWhite, $ttf, $home);
    imagettftext($img, 52, 0, (int)($W / 2 + 140), 310, $cWhite, $ttf, $away);

    // VS / Score centered
    $mid    = (($isLive || $isFinal) && $score) ? $score : 'VS';
    $midClr = (($isLive || $isFinal) && $score) ? $cYellow : $cGreen;
    $cx($mid, 310, 54, $midClr);

    // League name
    if (!empty($game['liga_nome'])) {
        $cx(mb_strtoupper((string) $game['liga_nome'], 'UTF-8'), 385, 18, $cGray);
    }

    // CTA line
    $cx($cta, 460, 17, $cGreen);

    // URL watermark
    $cx('betcopa.online', 520, 18, $cGray);

} else {
    // Fallback: built-in fonts (small but functional)
    imagestring($img, 5, (int)($W / 2) - 60, 135, $badge,  $bClr);
    imagestring($img, 5, 90,                  280, $home,   $cWhite);
    imagestring($img, 5, (int)($W / 2) + 80, 280, $away,   $cWhite);
    imagestring($img, 5, (int)($W / 2) - 12, 280, 'VS',    $cGreen);
    imagestring($img, 5, (int)($W / 2) - 90, 420, $cta,    $cGreen);
    imagestring($img, 5, (int)($W / 2) - 50, 470, 'betcopa.online', $cGray);
}

if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}
@imagepng($img, $cacheFile);

header('Content-Type: image/png');
header('Cache-Control: public, max-age=300');
header('X-OG-Cache: MISS');
imagepng($img);
imagedestroy($img);
