<?php
class TransactionRepository
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function create(int $userId, string $tipo, float $valor, string $descricao): void
    {
        $stmt = $this->db->prepare('INSERT INTO transacoes (user_id, tipo, valor, descricao) VALUES (:user_id, :tipo, :valor, :descricao)');
        $stmt->execute(['user_id' => $userId, 'tipo' => $tipo, 'valor' => $valor, 'descricao' => $descricao]);
    }

    public function balance(int $userId): float
    {
        $stmt = $this->db->prepare('SELECT tipo, SUM(valor) as total FROM transacoes WHERE user_id = :user_id GROUP BY tipo');
        $stmt->execute(['user_id' => $userId]);
        $rows = $stmt->fetchAll();
        $balance = 0.0;

        foreach ($rows as $row) {
            $balance += $row['tipo'] === 'credito' ? (float) $row['total'] : -(float) $row['total'];
        }

        return round($balance, 2);
    }

    public function listByUser(int $userId, int $limit = 30, int $offset = 0): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM transacoes WHERE user_id = :user_id ORDER BY data DESC LIMIT :limit OFFSET :offset'
        );
        $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':limit',   $limit,  PDO::PARAM_INT);
        $stmt->bindValue(':offset',  $offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function countByUser(int $userId): int
    {
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM transacoes WHERE user_id = :user_id');
        $stmt->execute(['user_id' => $userId]);
        return (int) $stmt->fetchColumn();
    }
}
