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

    public function listByUser(int $userId): array
    {
        $stmt = $this->db->prepare('SELECT * FROM transacoes WHERE user_id = :user_id ORDER BY data DESC');
        $stmt->execute(['user_id' => $userId]);
        return $stmt->fetchAll();
    }
}
