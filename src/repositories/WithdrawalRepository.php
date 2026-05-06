<?php
declare(strict_types=1);

class WithdrawalRepository
{
    public function __construct(private readonly PDO $db) {}

    public function create(int $userId, float $valor, string $chavePix, string $tipoPix): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO saques (user_id, valor, chave_pix, tipo_pix, status)
             VALUES (:user_id, :valor, :chave_pix, :tipo_pix, "pendente")'
        );
        $stmt->execute([
            'user_id'   => $userId,
            'valor'     => $valor,
            'chave_pix' => $chavePix,
            'tipo_pix'  => $tipoPix,
        ]);
        return (int) $this->db->lastInsertId();
    }

    public function listByUser(int $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM saques WHERE user_id = :uid ORDER BY criado_em DESC'
        );
        $stmt->execute(['uid' => $userId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM saques WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function updateStatus(int $id, string $status, string $obs = ''): void
    {
        $stmt = $this->db->prepare(
            'UPDATE saques SET status = :status, obs = :obs, processado_em = NOW() WHERE id = :id'
        );
        $stmt->execute(['status' => $status, 'obs' => $obs, 'id' => $id]);
    }

    public function listAll(): array
    {
        $stmt = $this->db->prepare(
            'SELECT s.*, u.nome AS user_nome, u.email AS user_email
             FROM saques s
             JOIN users u ON u.id = s.user_id
             ORDER BY s.criado_em DESC'
        );
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
