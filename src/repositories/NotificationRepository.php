<?php
declare(strict_types=1);

class NotificationRepository
{
    public function __construct(private readonly PDO $db)
    {
        $this->createTableIfNeeded();
    }

    private function createTableIfNeeded(): void
    {
        $this->db->exec('CREATE TABLE IF NOT EXISTS notifications (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            user_id   INT          NOT NULL,
            tipo      VARCHAR(50)  NOT NULL,
            titulo    VARCHAR(255) NOT NULL,
            corpo     TEXT,
            lida      TINYINT(1)   NOT NULL DEFAULT 0,
            url       VARCHAR(255) DEFAULT NULL,
            criado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    }

    public function create(int $userId, string $tipo, string $titulo, string $corpo = '', string $url = ''): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO notifications (user_id, tipo, titulo, corpo, url)
             VALUES (:uid, :tipo, :titulo, :corpo, :url)'
        );
        $stmt->execute([
            'uid'    => $userId,
            'tipo'   => $tipo,
            'titulo' => $titulo,
            'corpo'  => $corpo,
            'url'    => $url,
        ]);
        return (int) $this->db->lastInsertId();
    }

    public function listByUser(int $userId, int $limit = 20): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM notifications WHERE user_id = :uid ORDER BY criado_em DESC LIMIT :lim'
        );
        $stmt->bindValue('uid', $userId, PDO::PARAM_INT);
        $stmt->bindValue('lim', $limit,  PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function countUnread(int $userId): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) FROM notifications WHERE user_id = :uid AND lida = 0'
        );
        $stmt->execute(['uid' => $userId]);
        return (int) $stmt->fetchColumn();
    }

    public function markRead(int $id, int $userId): void
    {
        $this->db->prepare(
            'UPDATE notifications SET lida = 1 WHERE id = :id AND user_id = :uid'
        )->execute(['id' => $id, 'uid' => $userId]);
    }

    public function markAllRead(int $userId): void
    {
        $this->db->prepare(
            'UPDATE notifications SET lida = 1 WHERE user_id = :uid AND lida = 0'
        )->execute(['uid' => $userId]);
    }
}
