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
                    session_id VARCHAR(36)  NOT NULL,
                    user_id    INT          NULL,
                    page       VARCHAR(150) NULL,
                    source     VARCHAR(50)  NULL,
                    referrer   VARCHAR(500) NULL,
                    last_seen  DATETIME     NOT NULL,
                    PRIMARY KEY (session_id),
                    KEY idx_last_seen (last_seen)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );
        } catch (Exception $e) {
            // tabela já existe ou sem permissão — ignora
        }

        // Migra tabela existente adicionando colunas novas
        foreach (['page VARCHAR(150) NULL', 'source VARCHAR(50) NULL', 'referrer VARCHAR(500) NULL'] as $col) {
            try { $this->db->exec("ALTER TABLE online_sessions ADD COLUMN $col"); } catch (Exception $e) {}
        }
    }

    public function upsert(string $sessionId, ?int $userId, ?string $page = null, ?string $source = null, ?string $referrer = null): void
    {
        $stmt = $this->db->prepare(
            "INSERT INTO online_sessions (session_id, user_id, page, source, referrer, last_seen)
             VALUES (?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE user_id = ?, page = ?, source = ?, referrer = ?, last_seen = NOW()"
        );
        $stmt->execute([$sessionId, $userId, $page, $source, $referrer, $userId, $page, $source, $referrer]);
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
            "SELECT u.id, u.nome, u.email, os.page, os.source, os.referrer, os.last_seen
             FROM online_sessions os
             JOIN users u ON os.user_id = u.id
             WHERE os.last_seen >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)
             ORDER BY os.last_seen DESC"
        );
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function listAllSessions(): array
    {
        $stmt = $this->db->query(
            "SELECT os.session_id, os.user_id, os.page, os.source, os.referrer, os.last_seen,
                    u.nome, u.email
             FROM online_sessions os
             LEFT JOIN users u ON os.user_id = u.id
             WHERE os.last_seen >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)
             ORDER BY os.last_seen DESC"
        );
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
