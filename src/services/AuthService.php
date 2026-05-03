<?php
class AuthService
{
    private UserRepository $users;
    private TransactionRepository $transactions;

    public function __construct(UserRepository $users, TransactionRepository $transactions)
    {
        $this->users = $users;
        $this->transactions = $transactions;
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

        $hash = password_hash($senha, PASSWORD_DEFAULT);
        $userId = $this->users->create($nome, $email, $hash);
        $this->transactions->create($userId, 'credito', 100.00, 'Bônus inicial');
        Logger::info('Novo usuário', ['id' => $userId, 'email' => $email]);

        return ['id' => $userId, 'nome' => $nome, 'email' => $email];
    }

    public function login(string $email, string $senha): array
    {
        $user = $this->users->findByEmail($email);
        if (!$user || !password_verify($senha, $user['senha'])) {
            throw new InvalidArgumentException('Credenciais inválidas');
        }

        session_start();
        $_SESSION['user_id']    = $user['id'];
        $_SESSION['user_email'] = $user['email'];
        Logger::info('Login realizado', ['user_id' => $user['id']]);

        return $user;
    }
}
