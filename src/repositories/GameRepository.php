<?php
class GameRepository
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function all(): array
    {
        $stmt = $this->db->query('SELECT * FROM jogos ORDER BY data_hora ASC');
        return $stmt->fetchAll();
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM jogos WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }

    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO jogos (time_casa, time_fora, bandeira_casa, bandeira_fora, data_hora, status, odd, valor_base)
             VALUES (:time_casa, :time_fora, :bandeira_casa, :bandeira_fora, :data_hora, :status, :odd, :valor_base)'
        );
        $stmt->execute($data);
        return (int) $this->db->lastInsertId();
    }

    public function updateResult(int $id, string $placarReal): bool
    {
        $stmt = $this->db->prepare('UPDATE jogos SET placar_real = :placar_real, status = :status WHERE id = :id');
        return $stmt->execute(['placar_real' => $placarReal, 'status' => 'finalizado', 'id' => $id]);
    }
}
