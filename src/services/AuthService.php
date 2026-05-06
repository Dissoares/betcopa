<?php
class AuthService
{
    private UserRepository $users;
    private TransactionRepository $transactions;
    private ConfigRepository $config;

    public function __construct(UserRepository $users, TransactionRepository $transactions, ConfigRepository $config)
    {
        $this->users        = $users;
        $this->transactions = $transactions;
        $this->config       = $config;
    }

    public function register(string $nome, string $email, string $senha): array
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

        $bonus = (float) $this->config->get('bonus_cadastro', '0');
        if ($bonus > 0) {
            $this->transactions->create($userId, 'credito', $bonus, 'Bônus de cadastro');
        }

        Logger::info('Novo usuário', ['id' => $userId, 'email' => $email]);

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
        Logger::info('Login realizado', ['user_id' => $user['id']]);

        return $user;
    }
}
