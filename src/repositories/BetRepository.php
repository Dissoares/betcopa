<?php
class BetRepository
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function create(array $data): int
    {
        $stmt = $this->db->prepare('INSERT INTO apostas (user_id, jogo_id, placar_casa, placar_fora, valor, odd, possivel_ganho, status) VALUES (:user_id, :jogo_id, :placar_casa, :placar_fora, :valor, :odd, :possivel_ganho, :status)');
        $stmt->execute($data);
        return (int) $this->db->lastInsertId();
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT a.*, j.time_casa, j.time_fora, j.data_hora, j.placar_real, j.status AS jogo_status FROM apostas a JOIN jogos j ON a.jogo_id = j.id WHERE a.id = :id');
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }

    public function listByUser(int $userId): array
    {
        $stmt = $this->db->prepare('SELECT a.*, j.time_casa, j.time_fora, j.data_hora, j.status AS jogo_status FROM apostas a JOIN jogos j ON a.jogo_id = j.id WHERE a.user_id = :user_id ORDER BY a.criado_em DESC');
        $stmt->execute(['user_id' => $userId]);
        return $stmt->fetchAll();
    }

    public function updateStatus(int $id, string $status): bool
    {
        $stmt = $this->db->prepare('UPDATE apostas SET status = :status WHERE id = :id');
        return $stmt->execute(['status' => $status, 'id' => $id]);
    }

    public function confirmedByGame(int $jogoId): array
    {
        $stmt = $this->db->prepare('SELECT a.*, u.nome FROM apostas a JOIN users u ON a.user_id = u.id WHERE a.jogo_id = :jogo_id AND a.status = :status');
        $stmt->execute(['jogo_id' => $jogoId, 'status' => 'confirmado']);
        return $stmt->fetchAll();
    }

    public function winnersByGame(int $jogoId): array
    {
        $stmt = $this->db->prepare('SELECT a.*, u.nome FROM apostas a JOIN users u ON a.user_id = u.id WHERE a.jogo_id = :jogo_id AND a.status = :status');
        $stmt->execute(['jogo_id' => $jogoId, 'status' => 'ganhou']);
        return $stmt->fetchAll();
    }

    public function listCompleted(): array
    {
        $stmt = $this->db->query('SELECT a.*, u.nome, j.time_casa, j.time_fora, j.placar_real FROM apostas a JOIN users u ON a.user_id = u.id JOIN jogos j ON a.jogo_id = j.id WHERE j.status = "finalizado"');
        return $stmt->fetchAll();
    }
}
