<?php
class MagicTokenRepository
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
        $this->initTables();
    }

    private function initTables(): void
    {
        try {
            $this->db->exec("
                CREATE TABLE IF NOT EXISTS magic_tokens (
                    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
                    token      VARCHAR(64)  NOT NULL,
                    email      VARCHAR(255) NOT NULL,
                    user_id    INT          NOT NULL,
                    used       TINYINT(1)   NOT NULL DEFAULT 0,
                    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME     NOT NULL,
                    PRIMARY KEY (id),
                    UNIQUE KEY uniq_token (token),
                    KEY idx_email (email)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
        } catch (Exception $e) {}

        try {
            $this->db->exec("ALTER TABLE users ADD COLUMN remember_token VARCHAR(64) NULL");
        } catch (Exception $e) {}
    }

    public function create(string $email, int $userId): string
    {
        $token = bin2hex(random_bytes(32));
        $this->db->prepare(
            "INSERT INTO magic_tokens (token, email, user_id, expires_at)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))"
        )->execute([$token, $email, $userId]);
        return $token;
    }

    public function findValid(string $token): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM magic_tokens
             WHERE token = ? AND used = 0 AND expires_at > NOW()
             LIMIT 1"
        );
        $stmt->execute([$token]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function markUsed(int $id): void
    {
        $this->db->prepare("UPDATE magic_tokens SET used = 1 WHERE id = ?")->execute([$id]);
    }
}
