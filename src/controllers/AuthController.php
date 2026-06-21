<?php
class AuthController
{
    private AuthService $service;
    private ?PasswordResetRepository $resets        = null;
    private ?Mailer                  $mailer        = null;
    private ?MagicTokenRepository    $magicTokens   = null;
    private ?TransactionRepository   $transactions  = null;
    private ?ConfigRepository        $config        = null;

    public function __construct(AuthService $service)
    {
        $this->service = $service;
    }

    public function setPasswordReset(PasswordResetRepository $repo, Mailer $mailer): void
    {
        $this->resets = $repo;
        $this->mailer = $mailer;
    }

    public function setMagicLink(
        MagicTokenRepository  $tokens,
        TransactionRepository $transactions,
        ConfigRepository      $config
    ): void {
        $this->magicTokens  = $tokens;
        $this->transactions = $transactions;
        $this->config       = $config;
    }

    public function register(): void
    {
        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        if (!empty($_SERVER['HTTP_X_CSRF_TOKEN']) || !empty($body['csrf']) || !empty($body['csrf_token'])) {
            Csrf::verify();
        }
        $nome         = trim($body['nome'] ?? '');
        $email        = trim($body['email'] ?? '');
        $senha        = trim($body['senha'] ?? '');
        $referralCode = trim($body['referral_code'] ?? '');
        $user = $this->service->register($nome, $email, $senha, $referralCode ?: null);
        jsonResponse(['user' => $user]);
    }

    public function login(): void
    {
        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        if (!empty($_SERVER['HTTP_X_CSRF_TOKEN']) || !empty($body['csrf']) || !empty($body['csrf_token'])) {
            Csrf::verify();
        }
        $email = trim($body['email'] ?? '');
        $senha = trim($body['senha'] ?? '');
        $user = $this->service->login($email, $senha);
        jsonResponse(['user' => ['id' => $user['id'], 'nome' => $user['nome'], 'email' => $user['email']]]);
    }

    public function logout(): void
    {
        Csrf::verify();
        session_start();
        session_unset();
        session_destroy();
        jsonResponse(['message' => 'Logout concluído']);
    }

    public function forgotPassword(): void
    {
        $body  = json_decode(file_get_contents('php://input'), true) ?: [];
        $email = trim($body['email'] ?? '');

        if (!$email) {
            jsonResponse(['error' => 'E-mail obrigatório'], 422);
        }

        $baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                 . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');

        $token = $this->service->forgotPassword($email, $this->resets, $this->mailer, $baseUrl);

        // Sempre responde com sucesso (não revela se e-mail existe)
        $response = ['message' => 'Se o e-mail estiver cadastrado, você receberá as instruções em breve.'];

        // Em dev (mail desabilitado), retorna o link diretamente para facilitar testes
        if ($token) {
            $response['reset_url'] = $baseUrl . '/?reset=' . $token;
        }

        jsonResponse($response);
    }

    public function resetPassword(): void
    {
        $body     = json_decode(file_get_contents('php://input'), true) ?: [];
        $token    = trim($body['token']     ?? '');
        $novaSenha = trim($body['nova_senha'] ?? '');

        if (!$token || !$novaSenha) {
            jsonResponse(['error' => 'Dados incompletos'], 422);
        }

        $this->service->resetPassword($token, $novaSenha, $this->resets);
        jsonResponse(['message' => 'Senha redefinida com sucesso! Faça login.']);
    }

    public function requestMagicLink(UserRepository $users): void
    {
        $body  = json_decode(file_get_contents('php://input'), true) ?: [];
        $email = strtolower(trim($body['email'] ?? ''));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['error' => 'E-mail inválido'], 422);
            return;
        }

        $baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                 . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');

        $user  = $users->findByEmail($email);
        $isNew = !$user;
        $bonus = 0;

        if (!$user) {
            $nome   = ucfirst(strtok($email, '@')) ?: 'Jogador';
            $userId = $users->create($nome, $email, password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT));
            $user   = ['id' => $userId, 'nome' => $nome, 'email' => $email];

            if ($this->config && $this->transactions) {
                $bonus = (float) $this->config->get('bonus_cadastro', '0');
                if ($bonus > 0) {
                    $this->transactions->create($userId, 'credito', $bonus, 'Bônus de cadastro (magic link)');
                }
            }
        }

        $token    = $this->magicTokens->create($email, (int) $user['id']);
        $loginUrl = $baseUrl . '/?magic=' . $token;
        $sent     = $this->mailer?->magicLink($email, $user['nome'], $loginUrl, $bonus);

        $response = ['message' => 'Link de acesso enviado! Verifique seu e-mail.'];
        if (!$sent) {
            $response['magic_url'] = $loginUrl;
        }

        jsonResponse($response);
    }

    public function verifyMagicLink(UserRepository $users): void
    {
        $body  = json_decode(file_get_contents('php://input'), true) ?: [];
        $token = trim($body['token'] ?? '');

        if (!$token) {
            jsonResponse(['error' => 'Token inválido'], 422);
            return;
        }

        $magic = $this->magicTokens->findValid($token);
        if (!$magic) {
            jsonResponse(['error' => 'Link expirado ou já utilizado. Solicite um novo acesso.'], 410);
            return;
        }

        $user = $users->findById((int) $magic['user_id']);
        if (!$user || ($user['bloqueado'] ?? 0)) {
            jsonResponse(['error' => 'Conta não encontrada ou bloqueada.'], 403);
            return;
        }

        $this->magicTokens->markUsed((int) $magic['id']);

        session_start();
        $_SESSION['user_id']    = $user['id'];
        $_SESSION['user_email'] = $user['email'];

        $rememberToken = bin2hex(random_bytes(32));
        $users->setRememberToken((int) $user['id'], $rememberToken);

        $balance = $this->transactions ? $this->transactions->balance((int) $user['id']) : 0;
        $bonus   = $this->config ? (float) $this->config->get('bonus_cadastro', '0') : 0;

        jsonResponse([
            'user'           => ['id' => $user['id'], 'nome' => $user['nome'], 'email' => $user['email']],
            'remember_token' => $rememberToken,
            'balance'        => $balance,
            'bonus'          => $bonus,
        ]);
    }

    public function restoreSession(UserRepository $users): void
    {
        $body  = json_decode(file_get_contents('php://input'), true) ?: [];
        $token = trim($body['remember_token'] ?? '');

        if (!$token) {
            jsonResponse(['error' => 'Token ausente'], 422);
            return;
        }

        $user = $users->findByRememberToken($token);
        if (!$user || ($user['bloqueado'] ?? 0)) {
            jsonResponse(['error' => 'Sessão inválida'], 401);
            return;
        }

        session_start();
        $_SESSION['user_id']    = $user['id'];
        $_SESSION['user_email'] = $user['email'];

        jsonResponse([
            'user' => ['id' => $user['id'], 'nome' => $user['nome'], 'email' => $user['email']],
        ]);
    }

    public function googleLogin(): void
    {
        $body     = json_decode(file_get_contents('php://input'), true) ?: [];
        $idToken  = trim($body['credential'] ?? '');

        if (!$idToken) {
            jsonResponse(['error' => 'Token ausente'], 422);
        }

        $clientId = $this->service->getGoogleClientId();
        if (!$clientId) {
            jsonResponse(['error' => 'Login com Google não configurado. Contate o administrador.'], 503);
        }

        $user = $this->service->loginWithGoogle($idToken, $clientId);
        jsonResponse(['user' => ['id' => $user['id'], 'nome' => $user['nome'], 'email' => $user['email']]]);
    }
}
