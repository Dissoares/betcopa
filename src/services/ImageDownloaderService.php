<?php
class ImageDownloaderService
{
    private string $flagsDir;
    private string $logosDir;

    public function __construct()
    {
        $base            = __DIR__ . '/../../public/assets/';
        $this->flagsDir  = $base . 'flags/';
        $this->logosDir  = $base . 'logos/';

        if (!is_dir($this->flagsDir)) mkdir($this->flagsDir, 0755, true);
        if (!is_dir($this->logosDir)) mkdir($this->logosDir, 0755, true);
    }

    /**
     * Baixa a bandeira de um país pelo código ISO-2 se ainda não existir localmente.
     * Retorna o caminho web local, ou string vazia em caso de falha.
     */
    public function downloadFlag(string $code): string
    {
        $code = strtolower(trim($code));
        if (empty($code) || !preg_match('/^[a-z]{2}(-[a-z]+)?$/', $code)) return '';

        $dest = $this->flagsDir . $code . '.png';
        if (file_exists($dest)) return '/assets/flags/' . $code . '.png';

        $url  = "https://flagcdn.com/w80/{$code}.png";
        return $this->fetch($url, $dest) ? '/assets/flags/' . $code . '.png' : '';
    }

    /**
     * Baixa o logo de um time pela URL se ainda não existir localmente.
     * Retorna o caminho web local, ou a URL original em caso de falha.
     */
    public function downloadLogo(string $url): string
    {
        if (empty($url) || str_starts_with($url, '/assets/')) return $url;

        $hash = md5($url);
        $ext  = strtolower(pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));
        $ext  = in_array($ext, ['png', 'jpg', 'jpeg', 'webp', 'svg'], true) ? $ext : 'png';
        $dest = $this->logosDir . $hash . '.' . $ext;

        if (file_exists($dest)) return '/assets/logos/' . $hash . '.' . $ext;
        return $this->fetch($url, $dest) ? '/assets/logos/' . $hash . '.' . $ext : $url;
    }

    private function fetch(string $url, string $dest): bool
    {
        $ctx  = stream_context_create(['http' => [
            'timeout'    => 8,
            'user_agent' => 'BetCopa/1.0',
        ]]);
        $data = @file_get_contents($url, false, $ctx);
        if ($data === false || strlen($data) < 64) return false;
        return file_put_contents($dest, $data) !== false;
    }
}
