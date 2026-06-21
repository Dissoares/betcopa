<?php
declare(strict_types=1);

class ChatRepository
{
    public function __construct(private readonly PDO $db)
    {
        $this->initTable();
    }

    private function initTable(): void
    {
        try {
            $this->db->exec('CREATE TABLE IF NOT EXISTS chat_messages (
                id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
                user_id    INT UNSIGNED NOT NULL,
                sender     ENUM("system","user","admin") NOT NULL DEFAULT "system",
                message    TEXT NOT NULL,
                meta       JSON NULL,
                read_at    DATETIME NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_user (user_id),
                KEY idx_unread (user_id, sender, read_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        } catch (\Throwable) {}
    }

    public function send(int $userId, string $sender, string $message, ?array $meta = null): int
    {
        $this->db->prepare(
            'INSERT INTO chat_messages (user_id, sender, message, meta) VALUES (:uid, :sender, :msg, :meta)'
        )->execute([
            'uid'    => $userId,
            'sender' => $sender,
            'msg'    => $message,
            'meta'   => $meta ? json_encode($meta, JSON_UNESCAPED_UNICODE) : null,
        ]);
        return (int) $this->db->lastInsertId();
    }

    public function getForUser(int $userId, int $limit = 100): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM chat_messages WHERE user_id = :uid ORDER BY created_at ASC LIMIT :lim'
        );
        $stmt->bindValue('uid', $userId, PDO::PARAM_INT);
        $stmt->bindValue('lim', $limit,  PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function afterId(int $userId, int $afterId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM chat_messages WHERE user_id = :uid AND id > :aid ORDER BY created_at ASC'
        );
        $stmt->execute(['uid' => $userId, 'aid' => $afterId]);
        return $stmt->fetchAll();
    }

    public function getUnreadCount(int $userId): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) FROM chat_messages
             WHERE user_id = :uid AND sender != "user" AND read_at IS NULL'
        );
        $stmt->execute(['uid' => $userId]);
        return (int) $stmt->fetchColumn();
    }

    public function markReadByUser(int $userId): void
    {
        $this->db->prepare(
            'UPDATE chat_messages SET read_at = NOW()
             WHERE user_id = :uid AND sender != "user" AND read_at IS NULL'
        )->execute(['uid' => $userId]);
    }

    public function markReadByAdmin(int $userId): void
    {
        $this->db->prepare(
            'UPDATE chat_messages SET read_at = NOW()
             WHERE user_id = :uid AND sender = "user" AND read_at IS NULL'
        )->execute(['uid' => $userId]);
    }

    public function getConversations(): array
    {
        return $this->db->query(
            'SELECT
                cm.user_id,
                u.nome  AS user_nome,
                u.email AS user_email,
                MAX(cm.created_at) AS last_at,
                (SELECT message FROM chat_messages c2
                 WHERE c2.user_id = cm.user_id ORDER BY c2.id DESC LIMIT 1) AS last_message,
                (SELECT sender  FROM chat_messages c2
                 WHERE c2.user_id = cm.user_id ORDER BY c2.id DESC LIMIT 1) AS last_sender,
                SUM(CASE WHEN cm.sender = "user" AND cm.read_at IS NULL THEN 1 ELSE 0 END) AS unread_admin
             FROM chat_messages cm
             JOIN users u ON u.id = cm.user_id
             GROUP BY cm.user_id, u.nome, u.email
             ORDER BY last_at DESC'
        )->fetchAll();
    }

    public function getConversation(int $userId, int $limit = 150): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM chat_messages WHERE user_id = :uid ORDER BY created_at ASC LIMIT :lim'
        );
        $stmt->bindValue('uid', $userId, PDO::PARAM_INT);
        $stmt->bindValue('lim', $limit,  PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function countAdminUnread(): int
    {
        return (int) $this->db->query(
            'SELECT COUNT(*) FROM chat_messages WHERE sender = "user" AND read_at IS NULL'
        )->fetchColumn();
    }
}
