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
                user_id    INT UNSIGNED NULL,
                guest_id   VARCHAR(64)  NULL,
                sender     ENUM("system","user","admin") NOT NULL DEFAULT "system",
                message    TEXT NOT NULL,
                meta       JSON NULL,
                read_at    DATETIME NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_user  (user_id),
                KEY idx_guest (guest_id),
                KEY idx_unread (user_id, sender, read_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        } catch (\Throwable) {}

        // Migração: adiciona guest_id se não existir
        try {
            $cols = $this->db->query("SHOW COLUMNS FROM chat_messages LIKE 'guest_id'")->fetchAll();
            if (!$cols) {
                $this->db->exec("ALTER TABLE chat_messages
                    MODIFY COLUMN user_id INT UNSIGNED NULL,
                    ADD COLUMN guest_id VARCHAR(64) NULL AFTER user_id,
                    ADD INDEX idx_guest (guest_id)");
            }
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

    public function sendGuest(string $guestId, string $message, string $sender = 'user'): int
    {
        $allowed = ['user', 'system'];
        $sender  = in_array($sender, $allowed, true) ? $sender : 'user';
        $this->db->prepare(
            'INSERT INTO chat_messages (guest_id, sender, message) VALUES (:gid, :sender, :msg)'
        )->execute(['gid' => $guestId, 'sender' => $sender, 'msg' => $message]);
        return (int) $this->db->lastInsertId();
    }

    /** Vincula mensagens de guest a um user após login */
    public function claimGuest(string $guestId, int $userId): void
    {
        $this->db->prepare(
            'UPDATE chat_messages SET user_id = :uid, guest_id = NULL WHERE guest_id = :gid AND user_id IS NULL'
        )->execute(['uid' => $userId, 'gid' => $guestId]);
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

    public function markGuestReadByAdmin(string $guestId): void
    {
        $this->db->prepare(
            'UPDATE chat_messages SET read_at = NOW()
             WHERE guest_id = :gid AND sender = "user" AND read_at IS NULL'
        )->execute(['gid' => $guestId]);
    }

    public function getConversations(): array
    {
        // Conversas de usuários registrados
        $users = $this->db->query(
            'SELECT
                "user"      AS conv_type,
                cm.user_id  AS conv_key,
                u.nome      AS conv_nome,
                u.email     AS conv_email,
                MAX(cm.created_at) AS last_at,
                (SELECT message FROM chat_messages c2
                 WHERE c2.user_id = cm.user_id ORDER BY c2.id DESC LIMIT 1) AS last_message,
                (SELECT sender  FROM chat_messages c2
                 WHERE c2.user_id = cm.user_id ORDER BY c2.id DESC LIMIT 1) AS last_sender,
                SUM(CASE WHEN cm.sender = "user" AND cm.read_at IS NULL THEN 1 ELSE 0 END) AS unread_admin
             FROM chat_messages cm
             JOIN users u ON u.id = cm.user_id
             WHERE cm.user_id IS NOT NULL
             GROUP BY cm.user_id, u.nome, u.email
             ORDER BY last_at DESC'
        )->fetchAll();

        // Conversas de visitantes (sem user_id)
        $guests = $this->db->query(
            'SELECT
                "guest"    AS conv_type,
                guest_id   AS conv_key,
                "Visitante" AS conv_nome,
                guest_id   AS conv_email,
                MAX(created_at) AS last_at,
                (SELECT message FROM chat_messages c2
                 WHERE c2.guest_id = cm.guest_id ORDER BY c2.id DESC LIMIT 1) AS last_message,
                (SELECT sender  FROM chat_messages c2
                 WHERE c2.guest_id = cm.guest_id ORDER BY c2.id DESC LIMIT 1) AS last_sender,
                SUM(CASE WHEN sender = "user" AND read_at IS NULL THEN 1 ELSE 0 END) AS unread_admin
             FROM chat_messages cm
             WHERE guest_id IS NOT NULL AND user_id IS NULL
             GROUP BY guest_id
             ORDER BY last_at DESC'
        )->fetchAll();

        // Mescla e ordena por last_at
        $all = array_merge($users, $guests);
        usort($all, fn($a, $b) => strcmp((string)$b['last_at'], (string)$a['last_at']));
        return $all;
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

    public function guestAfterIdFromServer(string $guestId, int $afterId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM chat_messages WHERE guest_id = :gid AND id > :aid ORDER BY created_at ASC'
        );
        $stmt->execute(['gid' => $guestId, 'aid' => $afterId]);
        return $stmt->fetchAll();
    }

    public function getGuestConversation(string $guestId, int $limit = 150): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM chat_messages WHERE guest_id = :gid ORDER BY created_at ASC LIMIT :lim'
        );
        $stmt->bindValue('gid', $guestId);
        $stmt->bindValue('lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function sendGuestAdmin(string $guestId, string $message): int
    {
        $this->db->prepare(
            'INSERT INTO chat_messages (guest_id, sender, message) VALUES (:gid, "admin", :msg)'
        )->execute(['gid' => $guestId, 'msg' => $message]);
        return (int) $this->db->lastInsertId();
    }

    public function countAdminUnread(): int
    {
        return (int) $this->db->query(
            'SELECT COUNT(*) FROM chat_messages WHERE sender = "user" AND read_at IS NULL'
        )->fetchColumn();
    }
}
