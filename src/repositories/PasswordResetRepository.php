<?php
declare(strict_types=1);

class PasswordResetRepository
{
    public function __construct(private readonly PDO $db) {}

    public function create(int $userId, string $token): void
    {
        $this->db->prepare("DELETE FROM password_resets WHERE user_id = :uid")
                 ->execute(['uid' => $userId]);

        $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));
        $this->db->prepare(
            "INSERT INTO password_resets (user_id, token, expires_at) VALUES (:uid, :token, :expires)"
        )->execute(['uid' => $userId, 'token' => $token, 'expires' => $expires]);
    }

    public function findValid(string $token): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT pr.*, u.email, u.nome
             FROM password_resets pr
             JOIN users u ON u.id = pr.user_id
             WHERE pr.token = :token AND pr.usado = 0 AND pr.expires_at > NOW()"
        );
        $stmt->execute(['token' => $token]);
        return $stmt->fetch() ?: null;
    }

    public function markUsed(string $token): void
    {
        $this->db->prepare("UPDATE password_resets SET usado = 1 WHERE token = :token")
                 ->execute(['token' => $token]);
    }
}
