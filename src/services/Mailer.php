<?php
declare(strict_types=1);

class Mailer
{
    private string $from;
    private string $fromName;
    private string $siteName;
    private bool   $enabled;
    private string $logPath;

    public function __construct(ConfigRepository $config)
    {
        $this->from     = $config->get('mail_from',      'noreply@betcopa.local');
        $this->fromName = $config->get('mail_from_name', 'BetCopa');
        $this->siteName = $config->get('site_nome',      'BetCopa');
        $this->enabled  = $config->get('mail_enabled',   '0') === '1';
        $this->logPath  = __DIR__ . '/../../storage/logs/mail.log';
    }

    public function send(string $to, string $subject, string $html): bool
    {
        $this->log($to, $subject);
        if (!$this->enabled) return false;

        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "From: {$this->fromName} <{$this->from}>\r\n";

        return @mail($to, $subject, $html, $headers);
    }

    public function passwordReset(string $to, string $nome, string $resetUrl): bool
    {
        $subject = "Recuperação de senha — {$this->siteName}";
        $html    = $this->layout($subject, "
            <h2>Olá, {$nome}!</h2>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
            <p style='text-align:center;margin:2rem 0'>
                <a href='{$resetUrl}' style='background:#e63946;color:#fff;padding:.75rem 2rem;border-radius:.5rem;text-decoration:none;font-weight:700;display:inline-block'>
                    Redefinir senha
                </a>
            </p>
            <p style='color:#888;font-size:.875rem'>Este link expira em <strong>1 hora</strong>.<br>
            Se você não solicitou a redefinição, ignore este e-mail.</p>
        ");
        return $this->send($to, $subject, $html);
    }

    public function betWon(string $to, string $nome, string $jogo, string $palpite, string $placar, float $ganho): bool
    {
        $subject = "Você acertou! Prêmio creditado — {$this->siteName}";
        $html    = $this->layout($subject, "
            <h2>Parabéns, {$nome}! Você acertou o placar.</h2>
            <table style='width:100%;border-collapse:collapse;margin:1rem 0'>
                <tr style='border-bottom:1px solid #333'>
                    <td style='padding:.5rem 0;color:#888'>Jogo</td>
                    <td style='padding:.5rem 0'><strong>{$jogo}</strong></td>
                </tr>
                <tr style='border-bottom:1px solid #333'>
                    <td style='padding:.5rem 0;color:#888'>Seu palpite</td>
                    <td style='padding:.5rem 0'>{$palpite}</td>
                </tr>
                <tr style='border-bottom:1px solid #333'>
                    <td style='padding:.5rem 0;color:#888'>Placar final</td>
                    <td style='padding:.5rem 0'>{$placar}</td>
                </tr>
                <tr>
                    <td style='padding:.5rem 0;color:#888'>Prêmio</td>
                    <td style='padding:.5rem 0;color:#00C853;font-size:1.3rem;font-weight:700'>{$this->fmtR($ganho)}</td>
                </tr>
            </table>
            <p>O valor foi creditado na sua conta. Bom jogo!</p>
        ");
        return $this->send($to, $subject, $html);
    }

    public function withdrawalApproved(string $to, string $nome, float $valor): bool
    {
        $subject = "Saque aprovado — {$this->siteName}";
        $html    = $this->layout($subject, "
            <h2>Saque aprovado ✔</h2>
            <p>Olá, <strong>{$nome}</strong>!</p>
            <p>Seu saque de <strong>{$this->fmtR($valor)}</strong> foi aprovado e será processado em até 1 dia útil via PIX.</p>
        ");
        return $this->send($to, $subject, $html);
    }

    public function magicLink(string $to, string $nome, string $loginUrl, float $bonus = 0): bool
    {
        $subject  = "Seu link de acesso — {$this->siteName}";
        $bonusHtml = $bonus > 0
            ? "<div style='background:#0d2b0d;border:1px solid #1a5c1a;padding:.9rem 1.2rem;border-radius:.5rem;text-align:center;margin:1.2rem 0'>
                 <p style='margin:0 0 .3rem;color:#aaa;font-size:.82rem'>🎁 Bônus de boas-vindas</p>
                 <p style='margin:0;color:#59ff15;font-size:1.4rem;font-weight:800'>{$this->fmtR($bonus)}</p>
                 <p style='margin:.3rem 0 0;color:#aaa;font-size:.8rem'>já creditado na sua conta</p>
               </div>"
            : '';
        $html = $this->layout($subject, "
            <h2>Olá, {$nome}!</h2>
            <p>Clique no botão abaixo para entrar na sua conta e fazer seus palpites:</p>
            {$bonusHtml}
            <p style='text-align:center;margin:2rem 0'>
                <a href='{$loginUrl}' style='background:#59ff15;color:#001a0d;padding:.85rem 2.5rem;border-radius:.5rem;text-decoration:none;font-weight:800;display:inline-block;font-size:1rem'>
                    ⚡ Entrar agora
                </a>
            </p>
            <p style='color:#888;font-size:.875rem'>Este link expira em <strong>1 hora</strong> e pode ser usado uma única vez.<br>
            Se você não solicitou, ignore este e-mail.</p>
        ");
        return $this->send($to, $subject, $html);
    }

    public function withdrawalRejected(string $to, string $nome, float $valor, string $motivo): bool
    {
        $subject = "Saque não aprovado — {$this->siteName}";
        $html    = $this->layout($subject, "
            <h2>Saque não aprovado</h2>
            <p>Olá, <strong>{$nome}</strong>!</p>
            <p>Seu saque de <strong>{$this->fmtR($valor)}</strong> não foi aprovado e o saldo foi estornado.</p>
            " . ($motivo ? "<p style='background:#1e1e1e;padding:.75rem;border-radius:.4rem;color:#aaa'>Motivo: {$motivo}</p>" : '') . "
        ");
        return $this->send($to, $subject, $html);
    }

    private function layout(string $title, string $content): string
    {
        return "<!DOCTYPE html><html lang='pt-BR'><head>
            <meta charset='UTF-8'>
            <meta name='viewport' content='width=device-width,initial-scale=1'>
            <title>{$title}</title></head>
            <body style='margin:0;padding:0;background:#0d0d14;font-family:system-ui,sans-serif;color:#e0e0e0'>
            <div style='max-width:540px;margin:2rem auto;background:#1a1a2e;border-radius:.75rem;overflow:hidden'>
                <div style='background:#e63946;padding:1rem 1.5rem'>
                    <span style='color:#fff;font-weight:700;font-size:1.1rem'>{$this->siteName}</span>
                </div>
                <div style='padding:1.75rem 1.5rem'>
                    {$content}
                </div>
                <div style='padding:.75rem 1.5rem;background:#111;text-align:center;font-size:.78rem;color:#555'>
                    © {$this->siteName} · E-mail automático, não responda.
                </div>
            </div></body></html>";
    }

    private function fmtR(float $v): string
    {
        return 'R$ ' . number_format($v, 2, ',', '.');
    }

    private function log(string $to, string $subject): void
    {
        try {
            $dir = dirname($this->logPath);
            if (!is_dir($dir)) mkdir($dir, 0755, true);
            $line = sprintf("[%s] TO: %s | SUBJECT: %s\n", date('Y-m-d H:i:s'), $to, $subject);
            file_put_contents($this->logPath, $line, FILE_APPEND | LOCK_EX);
        } catch (\Throwable $e) {
            // logging is best-effort, never crash
        }
    }
}
