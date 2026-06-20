<?php
class UserController
{
    private UserRepository $users;
    private TransactionRepository $transactions;
    private ?WithdrawalRepository $withdrawals = null;

    public function __construct(UserRepository $users, TransactionRepository $transactions)
    {
        $this->users        = $users;
        $this->transactions = $transactions;
    }

    public function setWithdrawalRepository(WithdrawalRepository $repo): void
    {
        $this->withdrawals = $repo;
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

    public function profile(): void
    {
        $userId = ensureLogged();
        $user   = $this->users->findById($userId);
        if (!$user) { jsonResponse(['error' => 'Usuário não encontrado'], 404); }

        $page   = max(1, (int) ($_GET['page'] ?? 1));
        $limit  = 20;
        $offset = ($page - 1) * $limit;

        unset($user['senha']);
        $user['saldo'] = $this->transactions->balance($userId);

        jsonResponse([
            'user'         => $user,
            'stats'        => $this->users->getStats($userId),
            'transacoes'   => $this->transactions->listByUser($userId, $limit, $offset),
            'total_trans'  => $this->transactions->countByUser($userId),
            'saques'       => $this->withdrawals?->listByUser($userId) ?? [],
            'page'         => $page,
            'limit'        => $limit,
        ]);
    }

    public function updateProfile(): void
    {
        Csrf::verify();
        $userId = ensureLogged();
        $body   = json_decode(file_get_contents('php://input'), true) ?? [];

        $nome = trim((string) ($body['nome'] ?? ''));
        if (strlen($nome) < 2) {
            jsonResponse(['error' => 'Nome deve ter ao menos 2 caracteres.'], 422);
        }

        $tipoPix  = $body['tipo_pix']  ?? null;
        $chavePix = trim((string) ($body['chave_pix'] ?? ''));
        $telefone = trim((string) ($body['telefone']  ?? ''));

        $tiposValidos = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'];
        if ($tipoPix && !in_array($tipoPix, $tiposValidos, true)) {
            jsonResponse(['error' => 'Tipo de chave PIX inválido.'], 422);
        }

        $this->users->updateProfile($userId, [
            'nome'      => $nome,
            'telefone'  => $telefone ?: null,
            'tipo_pix'  => $tipoPix  ?: null,
            'chave_pix' => $chavePix ?: null,
        ]);

        jsonResponse(['message' => 'Perfil atualizado com sucesso.']);
    }
}
