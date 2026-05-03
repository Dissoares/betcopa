<?php
class UserController
{
    private UserRepository $users;
    private TransactionRepository $transactions;

    public function __construct(UserRepository $users, TransactionRepository $transactions)
    {
        $this->users = $users;
        $this->transactions = $transactions;
    }

    public function current(): void
    {
        $userId = ensureLogged();
        $user = $this->users->findById($userId);
        if (!$user) {
            jsonResponse(['error' => 'Usuário não encontrado'], 404);
        }
        $user['saldo'] = $this->transactions->balance($userId);
        unset($user['senha']);
        jsonResponse(['user' => $user]);
    }
}
