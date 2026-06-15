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

    public function listByUser(int $userId, int $page = 1, int $limit = 10): array
    {
        $offset = ($page - 1) * $limit;
        $stmt   = $this->db->prepare('SELECT a.*, j.time_casa, j.time_fora, j.data_hora, j.status AS jogo_status, j.bandeira_casa, j.bandeira_fora, j.logo_casa, j.logo_fora, j.liga_nome FROM apostas a JOIN jogos j ON a.jogo_id = j.id WHERE a.user_id = :user_id ORDER BY a.criado_em DESC LIMIT :limit OFFSET :offset');
        $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':limit',   $limit,  PDO::PARAM_INT);
        $stmt->bindValue(':offset',  $offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function countByUser(int $userId): int
    {
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM apostas WHERE user_id = :user_id');
        $stmt->execute(['user_id' => $userId]);
        return (int) $stmt->fetchColumn();
    }

    public function updateStatus(int $id, string $status): bool
    {
        $stmt = $this->db->prepare('UPDATE apostas SET status = :status WHERE id = :id');
        return $stmt->execute(['status' => $status, 'id' => $id]);
    }

    public function confirmedByGame(int $jogoId): array
    {
        $stmt = $this->db->prepare('SELECT a.*, u.nome, u.email FROM apostas a JOIN users u ON a.user_id = u.id WHERE a.jogo_id = :jogo_id AND a.status = :status');
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
        $stmt = $this->db->query('SELECT a.*, u.nome, j.time_casa, j.time_fora, j.placar_real, j.bandeira_casa, j.bandeira_fora, j.logo_casa, j.logo_fora FROM apostas a JOIN users u ON a.user_id = u.id JOIN jogos j ON a.jogo_id = j.id WHERE j.status = "finalizado"');
        return $stmt->fetchAll();
    }

    public function deleteAll(): int
    {
        return (int) $this->db->exec('DELETE FROM apostas');
    }

    /**
     * Exclui apostas em lote — ignora as que estão pago/ganhou/perdido.
     * Retorna IDs efetivamente excluídos.
     */
    public function deleteMany(array $ids): array
    {
        if (empty($ids)) return [];
        $ids = array_map('intval', $ids);
        $ph  = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db->prepare(
            "SELECT id FROM apostas WHERE id IN ({$ph}) AND status NOT IN ('pago','ganhou','perdido')"
        );
        $stmt->execute($ids);
        $allowed = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'id');
        if (empty($allowed)) return [];

        $ph2 = implode(',', array_fill(0, count($allowed), '?'));
        $this->db->prepare("DELETE FROM apostas WHERE id IN ({$ph2})")->execute($allowed);
        return $allowed;
    }

    public function recentWins(int $limit = 15): array
    {
        $stmt = $this->db->prepare(
            'SELECT u.nome, a.possivel_ganho, j.time_casa, j.time_fora, j.placar_real
             FROM apostas a
             JOIN users u ON a.user_id = u.id
             JOIN jogos j ON a.jogo_id = j.id
             WHERE a.status = :status
             ORDER BY a.id DESC
             LIMIT :limit'
        );
        $stmt->bindValue(':status', 'ganhou');
        $stmt->bindValue(':limit',  $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
