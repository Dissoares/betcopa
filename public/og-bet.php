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

if (!$bet) { http_response_code(404); exit; }

$gameRepo = new GameRepository(Database::connection());
$game     = $gameRepo->find((int) $bet['jogo_id']);
if (!$game) { http_response_code(404); exit; }

if (!function_exists('imagecreatetruecolor')) { http_response_code(500); exit; }

$cacheDir  = __DIR__ . '/assets/og-cache';
$cacheVer  = filemtime(__FILE__);
$cacheFile = $cacheDir . '/bet-' . $id . '-' . $cacheVer . '.png';

if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 3600) {
    header('Content-Type: image/png');
    header('Cache-Control: public, max-age=300');
    readfile($cacheFile);
    exit;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hue2rgb(float $p, float $q, float $t): float {
    if ($t < 0) $t += 1; if ($t > 1) $t -= 1;
    if ($t < 1/6) return $p + ($q - $p) * 6 * $t;
    if ($t < 1/2) return $q;
    if ($t < 2/3) return $p + ($q - $p) * (2/3 - $t) * 6;
    return $p;
}

function hslToRgb(float $h, float $s, float $l): array {
    $h /= 360; $s /= 100; $l /= 100;
    if ($s === 0.0) { $v = (int)($l * 255); return [$v, $v, $v]; }
    $q = $l < 0.5 ? $l * (1 + $s) : $l + $s - $l * $s;
    $p = 2 * $l - $q;
    return [
        (int)(hue2rgb($p, $q, $h + 1/3) * 255),
        (int)(hue2rgb($p, $q, $h)       * 255),
        (int)(hue2rgb($p, $q, $h - 1/3) * 255),
    ];
}

function flagBox(GdImage $img, string $code, int $x, int $y, int $w, int $h, ?string $ttf): void {
    $text = mb_strtoupper(mb_substr($code ?: '??', 0, 2, 'UTF-8'), 'UTF-8');
    $c0   = mb_strlen($text, 'UTF-8') > 0 ? ord(mb_substr($text, 0, 1, 'UTF-8')) : 63;
    $c1   = mb_strlen($text, 'UTF-8') > 1 ? ord(mb_substr($text, 1, 1, 'UTF-8')) : 0;
    $hue  = ($c0 * 53 + $c1 * 29) % 360;

    // dark background
    [$r1,$g1,$b1] = hslToRgb($hue, 60, 30);
    $cBg = imagecolorallocate($img, $r1, $g1, $b1);
    imagefilledrectangle($img, $x, $y, $x + $w, $y + $h, $cBg);

    // horizontal stripe (flag-like, ~16% opacity simulated by blending)
    [$r2,$g2,$b2] = hslToRgb($hue, 85, 60);
    $sy1 = $y + (int)($h * 0.35);
    $sy2 = $y + (int)($h * 0.65);
    // simulate transparency by blending stripe color with bg
    $sr  = (int)(($r2 * 0.18 + $r1 * 0.82));
    $sg  = (int)(($g2 * 0.18 + $g1 * 0.82));
    $sb  = (int)(($b2 * 0.18 + $b1 * 0.82));
    $cStripe = imagecolorallocate($img, $sr, $sg, $sb);
    imagefilledrectangle($img, $x + 2, $sy1, $x + $w - 2, $sy2, $cStripe);

    // border
    $br  = (int)(($r2 * 0.45 + $r1 * 0.55));
    $bg_ = (int)(($g2 * 0.45 + $g1 * 0.55));
    $bb  = (int)(($b2 * 0.45 + $b1 * 0.55));
    $cBorder = imagecolorallocate($img, $br, $bg_, $bb);
    imagerectangle($img, $x, $y, $x + $w, $y + $h, $cBorder);

    // text centered
    [$tr,$tg,$tb] = hslToRgb($hue, 90, 90);
    $cText = imagecolorallocate($img, $tr, $tg, $tb);
    $fSize = (int)($h * 0.40);

    if ($ttf && function_exists('imagettftext')) {
        $bb2 = imagettfbbox($fSize, 0, $ttf, $text);
        $tw  = (int)abs($bb2[4] - $bb2[0]);
        $th  = (int)abs($bb2[1] - $bb2[7]);
        imagettftext($img, $fSize, 0,
            $x + (int)(($w - $tw) / 2),
            $y + (int)(($h + $th) / 2),
            $cText, $ttf, $text);
    } else {
        imagestring($img, 5, $x + (int)($w / 2) - 8, $y + (int)($h / 2) - 8, $text, $cText);
    }
}

// ── Canvas ────────────────────────────────────────────────────────────────────

$W = 1200; $H = 630;

$img = imagecreatetruecolor($W, $H);
imagealphablending($img, true);
imagesavealpha($img, true);

$cBg      = imagecolorallocate($img, 8,   12,  24);
$cCard    = imagecolorallocate($img, 13,  20,  36);
$cGreen   = imagecolorallocate($img, 0,   200, 83);
$cGreenDk = imagecolorallocate($img, 0,   90,  38);
$cWhite   = imagecolorallocate($img, 255, 255, 255);
$cGray    = imagecolorallocate($img, 107, 114, 128);
$cYellow  = imagecolorallocate($img, 255, 215, 0);
$cBorder  = imagecolorallocate($img, 30,  38,  58);
$cScoreBg = imagecolorallocate($img, 10,  32,  14);
$cDot     = imagecolorallocate($img, 20,  28,  45);   // subtle dot grid

imagefill($img, 0, 0, $cBg);

// Dot grid (subtle)
for ($gx = 20; $gx < $W; $gx += 28)
    for ($gy = 20; $gy < $H; $gy += 28)
        imagesetpixel($img, $gx, $gy, $cDot);

// Soccer ball watermarks
function ballMark(GdImage $img, int $cx, int $cy, int $r, $color): void {
    imagearc($img, $cx, $cy, $r * 2, $r * 2, 0, 360, $color);
    $ri = (int)($r * 0.35);
    imagefilledellipse($img, $cx, $cy, $ri * 2, $ri * 2, $color);
    for ($i = 0; $i < 5; $i++) {
        $ang = ($i * 2 * M_PI / 5) - M_PI / 2;
        $bx  = (int)($cx + $r * 0.62 * cos($ang));
        $by  = (int)($cy + $r * 0.62 * sin($ang));
        imagefilledellipse($img, $bx, $by, (int)($r * 0.38), (int)($r * 0.38), $color);
    }
}
$cBall = imagecolorallocate($img, 20, 28, 46);
ballMark($img, 55,       $H - 55, 70, $cBall);
ballMark($img, $W - 55,  55,      55, $cBall);
ballMark($img, 140,      (int)($H * 0.42), 42, $cBall);
ballMark($img, $W - 140, (int)($H * 0.58), 42, $cBall);

// Card background
imagefilledrectangle($img, 70, 70, $W - 70, $H - 70, $cCard);
imagerectangle($img,       70, 70, $W - 70, $H - 70, $cBorder);

// Green bars
imagefilledrectangle($img, 0, 0,      $W, 5,   $cGreen);
imagefilledrectangle($img, 0, $H - 5, $W, $H,  $cGreen);

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

$home      = mb_strtoupper((string)($game['time_casa'] ?? $bet['time_casa']), 'UTF-8');
$away      = mb_strtoupper((string)($game['time_fora'] ?? $bet['time_fora']), 'UTF-8');
$scoreCasa = (int) $bet['placar_casa'];
$scoreFora = (int) $bet['placar_fora'];
$liga      = mb_strtoupper((string)($game['liga_nome'] ?? ''), 'UTF-8');
$codeHome  = $game['bandeira_casa'] ?? '';
$codeAway  = $game['bandeira_fora'] ?? '';

if ($ttf && function_exists('imagettftext')) {

    $textCenter = function(string $text, int $y, float $size, $color) use ($img, $ttf, $W): void {
        $bb = imagettfbbox($size, 0, $ttf, $text);
        $tw = (int) abs($bb[4] - $bb[0]);
        imagettftext($img, $size, 0, (int)(($W - $tw) / 2), $y, $color, $ttf, $text);
    };

    // "Palpite" top-left
    imagettftext($img, 22, 0, 100, 118, $cGreen, $ttf, 'Palpite');

    // Date badge top-right
    $dt      = new DateTime($game['data_hora']);
    $dateStr = $dt->format('d/m, H:i');
    $bbD     = imagettfbbox(18, 0, $ttf, $dateStr);
    $twD     = (int) abs($bbD[4] - $bbD[0]);
    $thD     = (int) abs($bbD[1] - $bbD[7]);
    $px = 18; $py = 10;
    $dx1 = $W - 100 - $twD - $px * 2; $dy1 = 92;
    $dx2 = $dx1 + $twD + $px * 2;     $dy2 = $dy1 + $thD + $py * 2;
    imagerectangle($img, $dx1, $dy1, $dx2, $dy2, $cGreen);
    imagettftext($img, 18, 0, $dx1 + $px, $dy1 + $py + $thD, $cGreen, $ttf, $dateStr);

    // Liga ★
    if ($liga) {
        $ligaLabel = '* ' . $liga . ' *';
        $textCenter($ligaLabel, 178, 28, $cYellow);
        // underline
        $bbL = imagettfbbox(28, 0, $ttf, $ligaLabel);
        $twL = (int) abs($bbL[4] - $bbL[0]);
        $lx  = (int)(($W - $twL) / 2);
        imagefilledrectangle($img, $lx, 184, $lx + $twL, 186, $cYellow);
    }

    // Flag boxes
    $flagW = 160; $flagH = 108;
    $flagY  = 210;
    $leftFX  = (int)($W / 2) - 260 - $flagW / 2;   // ~390 left of center
    $rightFX = (int)($W / 2) + 260 - $flagW / 2;   // right of center

    flagBox($img, $codeHome ?: mb_substr($home, 0, 2, 'UTF-8'), (int)$leftFX,  $flagY, $flagW, $flagH, $ttf);
    flagBox($img, $codeAway ?: mb_substr($away, 0, 2, 'UTF-8'), (int)$rightFX, $flagY, $flagW, $flagH, $ttf);

    // "vs" circle center
    $vsR = 34;
    $vsCX = (int)($W / 2); $vsCY = $flagY + (int)($flagH / 2);
    imagefilledellipse($img, $vsCX, $vsCY, $vsR * 2, $vsR * 2, $cCard);
    imageellipse($img, $vsCX, $vsCY, $vsR * 2, $vsR * 2, $cBorder);
    $bbVs = imagettfbbox(20, 0, $ttf, 'vs');
    $twVs = (int) abs($bbVs[4] - $bbVs[0]);
    $thVs = (int) abs($bbVs[1] - $bbVs[7]);
    imagettftext($img, 20, 0, $vsCX - (int)($twVs / 2), $vsCY + (int)($thVs / 2), $cGray, $ttf, 'vs');

    // Team names
    $nameY = $flagY + $flagH + 44;

    $bbH = imagettfbbox(26, 0, $ttf, $home);
    $twH = (int) abs($bbH[4] - $bbH[0]);
    imagettftext($img, 26, 0, (int)($leftFX  + ($flagW - $twH) / 2), $nameY, $cWhite, $ttf, $home);

    $bbA = imagettfbbox(26, 0, $ttf, $away);
    $twA = (int) abs($bbA[4] - $bbA[0]);
    imagettftext($img, 26, 0, (int)($rightFX + ($flagW - $twA) / 2), $nameY, $cWhite, $ttf, $away);

    // Score box
    $scoreStr = $scoreCasa . '  x  ' . $scoreFora;
    $boxW = 310; $boxH = 112;
    $bx1  = (int)(($W - $boxW) / 2); $bx2 = $bx1 + $boxW;
    $by1  = $nameY + 22;             $by2 = $by1 + $boxH;

    imagefilledrectangle($img, $bx1, $by1, $bx2, $by2, $cScoreBg);
    imagerectangle($img,       $bx1, $by1, $bx2, $by2, $cGreen);

    // "MEU PALPITE" label inside box
    $textCenter('MEU PALPITE', $by1 + 30, 15, $cGray);

    // Score
    $bbS = imagettfbbox(52, 0, $ttf, $scoreStr);
    $twS = (int) abs($bbS[4] - $bbS[0]);
    $thS = (int) abs($bbS[1] - $bbS[7]);
    imagettftext($img, 52, 0, (int)(($W - $twS) / 2), $by2 - 18, $cWhite, $ttf, $scoreStr);

} else {
    imagestring($img, 4, 100, 95, 'Palpite', $cGreen);
    if ($liga) imagestring($img, 4, (int)($W/2) - 60, 150, $liga, $cYellow);
    imagestring($img, 5, 140,           290, $home, $cWhite);
    imagestring($img, 5, (int)($W-220), 290, $away, $cWhite);
    imagestring($img, 5, (int)($W/2)-10, 290, 'vs', $cGray);
    imagestring($img, 5, (int)($W/2)-20, 420, $scoreCasa . ' x ' . $scoreFora, $cWhite);
}

if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);
@imagepng($img, $cacheFile);

header('Content-Type: image/png');
header('Cache-Control: public, max-age=300');
imagepng($img);
imagedestroy($img);
