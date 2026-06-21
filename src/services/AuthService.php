<?php
class AuthService
{
    private UserRepository $users;
    private TransactionRepository $transactions;
    private ConfigRepository $config;
    private ?ChatRepository $chat = null;

    public function __construct(UserRepository $users, TransactionRepository $transactions, ConfigRepository $config)
    {
        $this->users        = $users;
        $this->transactions = $transactions;
        $this->config       = $config;
    }

    public function setChat(ChatRepository $chat): void { $this->chat = $chat; }

    public function register(string $nome, string $email, string $senha, ?string $referralCode = null): array
    {
        if (strlen($nome) < 3) {
            throw new InvalidArgumentException('Nome muito curto');
        }
        if (!validateEmail($email)) {
            throw new InvalidArgumentException('Email inválido');
        }
        if (strlen($senha) < 6) {
            throw new InvalidArgumentException('Senha muito curta');
        }
        if ($this->users->findByEmail($email)) {
            throw new InvalidArgumentException('Email já cadastrado');
        }

        $hash   = password_hash($senha, PASSWORD_DEFAULT);
        $userId = $this->users->create($nome, $email, $hash);

        // Gera código de indicação para o novo usuário
        $this->users->ensureReferralCode($userId);

        // Aplica bônus ao indicador (se veio com referral_code válido)
        if ($referralCode) {
            $referrer = $this->users->findByReferralCode($referralCode);
            if ($referrer && (int)$referrer['id'] !== $userId) {
                $this->users->setReferredBy($userId, (int)$referrer['id']);
                $bonusRef = (float) $this->config->get('bonus_indicacao', '10');
                if ($bonusRef > 0) {
                    $this->transactions->create(
                        (int)$referrer['id'],
                        'credito',
                        $bonusRef,
                        'Bônus de indicação — novo amigo cadastrado'
                    );
                }
            }
        }

        $bonus = (float) $this->config->get('bonus_cadastro', '0');
        if ($bonus > 0) {
            $this->transactions->create($userId, 'credito', $bonus, 'Bônus de cadastro');
        }

        Logger::info('Novo usuário', ['id' => $userId, 'email' => $email]);

        $boasVindas = "👋 Bem-vindo ao BetCopa, **{$nome}**! Aqui você palpita no placar exato dos jogos e pode ganhar prêmios reais. Qualquer dúvida é só responder aqui — estamos sempre por perto! ⚽";
        if ($bonus > 0) {
            $boasVindas .= "\n\n🎁 Você já recebeu **R\$ " . number_format($bonus, 2, ',', '.') . "** de bônus de boas-vindas no seu saldo!";
        }
        $this->chat?->send($userId, 'system', $boasVindas, ['type' => 'welcome']);

        return ['id' => $userId, 'nome' => $nome, 'email' => $email];
    }

    public function forgotPassword(string $email, PasswordResetRepository $resets, Mailer $mailer, string $baseUrl): ?string
    {
        $user = $this->users->findByEmail($email);
        if (!$user) return null; // não revela se e-mail existe

        $token    = bin2hex(random_bytes(32));
        $resets->create((int) $user['id'], $token);

        $resetUrl = rtrim($baseUrl, '/') . '/?reset=' . $token;
        $mailer->passwordReset($user['email'], $user['nome'], $resetUrl);
        Logger::info('Reset de senha solicitado', ['user_id' => $user['id']]);

        return $token;
    }

    public function resetPassword(string $token, string $novaSenha, PasswordResetRepository $resets): void
    {
        if (strlen($novaSenha) < 6) {
            throw new InvalidArgumentException('Senha muito curta (mínimo 6 caracteres)');
        }
        $reset = $resets->findValid($token);
        if (!$reset) {
            throw new InvalidArgumentException('Link inválido ou expirado');
        }
        $this->users->updatePassword((int) $reset['user_id'], password_hash($novaSenha, PASSWORD_DEFAULT));
        $resets->markUsed($token);
        Logger::info('Senha redefinida', ['user_id' => $reset['user_id']]);
    }

    public function login(string $email, string $senha): array
    {
        $user = $this->users->findByEmail($email);
        if (!$user || !password_verify($senha, $user['senha'])) {
            throw new InvalidArgumentException('Credenciais inválidas');
        }
        if (!empty($user['bloqueado'])) {
            throw new InvalidArgumentException('Conta suspensa. Entre em contato com o suporte.');
        }

        session_start();
        $_SESSION['user_id']    = $user['id'];
        $_SESSION['user_email'] = $user['email'];
        $_SESSION['is_admin']   = !empty($user['is_admin']);
        Logger::info('Login realizado', ['user_id' => $user['id']]);

        return $user;
    }

    /**
     * Retorna o Google OAuth Client ID configurado no admin, ou null.
     */
    public function getGoogleClientId(): ?string
    {
        $id = $this->config->get('google_client_id', '');
        return $id !== '' ? $id : null;
    }

    /**
     * Autentica ou registra usuário via token Google Identity Services.
     * Verifica o ID token na API do Google e cria/encontra a conta local.
     */
    public function loginWithGoogle(string $idToken, string $clientId): array
    {
        // Verifica token na API do Google
        $url  = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken);
        $ch   = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
        ]);
        $body  = curl_exec($ch);
        $errno = curl_errno($ch);
        curl_close($ch);

        if ($errno || !$body) {
            throw new RuntimeException('Falha ao verificar token Google. Tente novamente.');
        }

        $payload = json_decode($body, true) ?? [];

        if (isset($payload['error'])) {
            throw new InvalidArgumentException('Token Google inválido ou expirado.');
        }

        // Valida audience
        if (($payload['aud'] ?? '') !== $clientId) {
            throw new InvalidArgumentException('Token Google não pertence a esta aplicação.');
        }

        // Exige e-mail verificado
        if (($payload['email_verified'] ?? 'false') !== 'true' && ($payload['email_verified'] ?? false) !== true) {
            throw new InvalidArgumentException('E-mail Google não verificado.');
        }

        $googleId = (string) ($payload['sub']   ?? '');
        $email    = (string) ($payload['email'] ?? '');
        $nome     = (string) ($payload['name']  ?? $email);

        if (!$googleId || !$email) {
            throw new InvalidArgumentException('Token Google não contém dados necessários.');
        }

        // Busca por google_id primeiro, depois por e-mail
        $user = $this->users->findByGoogleId($googleId);

        if (!$user) {
            $user = $this->users->findByEmail($email);
            if ($user) {
                // Vincula google_id à conta existente
                $this->users->setGoogleId((int) $user['id'], $googleId);
                $user['google_id'] = $googleId;
            }
        }

        if (!$user) {
            // Cria nova conta automaticamente
            $userId = $this->users->createWithGoogle($nome, $email, $googleId);

            $bonus = (float) $this->config->get('bonus_cadastro', '0');
            if ($bonus > 0) {
                $this->transactions->create($userId, 'credito', $bonus, 'Bônus de cadastro');
            }

            Logger::info('Conta Google criada', ['id' => $userId, 'email' => $email]);
            $user = $this->users->findById($userId);
        }

        if (!empty($user['bloqueado'])) {
            throw new InvalidArgumentException('Conta suspensa. Entre em contato com o suporte.');
        }

        session_start();
        $_SESSION['user_id']    = $user['id'];
        $_SESSION['user_email'] = $user['email'];
        $_SESSION['is_admin']   = !empty($user['is_admin']);
        Logger::info('Login Google', ['user_id' => $user['id']]);

        return $user;
    }
}
