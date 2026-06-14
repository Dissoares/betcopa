<?php
class OnlineRepository
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
        try {
            $this->db->exec(
                "CREATE TABLE IF NOT EXISTS online_sessions (
                    session_id VARCHAR(36) NOT NULL,
                    user_id    INT         NULL,
                    last_seen  DATETIME    NOT NULL,
                    PRIMARY KEY (session_id),
                    KEY idx_last_seen (last_seen)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );
        } catch (Exception $e) {
            // tabela já existe ou sem permissão — ignora
        }
    }

    public function upsert(string $sessionId, ?int $userId): void
    {
        $stmt = $this->db->prepare(
            "INSERT INTO online_sessions (session_id, user_id, last_seen)
             VALUES (?, ?, NOW())
             ON DUPLICATE KEY UPDATE user_id = ?, last_seen = NOW()"
        );
        $stmt->execute([$sessionId, $userId, $userId]);
        $this->db->exec(
            "DELETE FROM online_sessions WHERE last_seen < DATE_SUB(NOW(), INTERVAL 5 MINUTE)"
        );
    }

    public function stats(): array
    {
        $stmt = $this->db->query(
            "SELECT
                COUNT(*)                 AS total,
                SUM(user_id IS NOT NULL) AS usuarios,
                SUM(user_id IS NULL)     AS visitantes
             FROM online_sessions
             WHERE last_seen >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)"
        );
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return [
            'total'      => (int) ($row['total']      ?? 0),
            'usuarios'   => (int) ($row['usuarios']   ?? 0),
            'visitantes' => (int) ($row['visitantes'] ?? 0),
        ];
    }

    public function listOnlineUsers(): array
    {
        $stmt = $this->db->query(
            "SELECT u.id, u.nome, u.email, os.last_seen
             FROM online_sessions os
             JOIN users u ON os.user_id = u.id
             WHERE os.last_seen >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)
             ORDER BY os.last_seen DESC"
        );
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
