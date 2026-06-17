<?php
declare(strict_types=1);

class SessionEventRepository
{
    public function __construct(private readonly PDO $db)
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS session_events (
              id         INT AUTO_INCREMENT PRIMARY KEY,
              session_id VARCHAR(36)  NOT NULL,
              event_type VARCHAR(40)  NOT NULL,
              label      VARCHAR(200) NOT NULL,
              created_at DATETIME     NOT NULL DEFAULT NOW(),
              INDEX idx_se_sid (session_id),
              INDEX idx_se_ts  (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
    }

    public function insert(string $sessionId, string $type, string $label): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO session_events (session_id, event_type, label) VALUES (?, ?, ?)'
        );
        $stmt->execute([$sessionId, $type, $label]);
    }

    public function getBySession(string $sessionId, int $limit = 200): array
    {
        $stmt = $this->db->prepare(
            'SELECT event_type, label, created_at
             FROM session_events
             WHERE session_id = ?
             ORDER BY created_at ASC
             LIMIT ?'
        );
        $stmt->bindValue(1, $sessionId);
        $stmt->bindValue(2, $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function purgeOlderThan(int $days = 30): void
    {
        $this->db->exec("DELETE FROM session_events WHERE created_at < NOW() - INTERVAL {$days} DAY");
    }
}
