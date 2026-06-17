<?php
class UserRepository
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function findByEmail(string $email): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM users WHERE email = :email');
        $stmt->execute(['email' => $email]);
        return $stmt->fetch() ?: null;
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM users WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }

    public function create(string $nome, string $email, string $senha): int
    {
        $stmt = $this->db->prepare('INSERT INTO users (nome, email, senha) VALUES (:nome, :email, :senha)');
        $stmt->execute(['nome' => $nome, 'email' => $email, 'senha' => $senha]);
        return (int) $this->db->lastInsertId();
    }

    public function block(int $id): void
    {
        $this->db->prepare('UPDATE users SET bloqueado = 1 WHERE id = :id')->execute(['id' => $id]);
    }

    public function unblock(int $id): void
    {
        $this->db->prepare('UPDATE users SET bloqueado = 0 WHERE id = :id')->execute(['id' => $id]);
    }

    public function setAdmin(int $id, bool $value): void
    {
        $this->db->prepare('UPDATE users SET is_admin = :v WHERE id = :id')
                 ->execute(['v' => $value ? 1 : 0, 'id' => $id]);
    }

    /** Exclui usuários em lote, protegendo o admin pelo email. */
    public function deleteMany(array $ids, string $adminEmail): array
    {
        if (empty($ids)) return [];
        $ids  = array_map('intval', $ids);
        $ph   = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db->prepare(
            "SELECT id FROM users WHERE id IN ({$ph}) AND email != ?"
        );
        $stmt->execute([...$ids, $adminEmail]);
        $allowed = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'id');
        if (empty($allowed)) return [];

        $ph2 = implode(',', array_fill(0, count($allowed), '?'));
        $this->db->prepare("DELETE FROM users WHERE id IN ({$ph2})")->execute($allowed);
        return $allowed;
    }

    /** Exclui todos os usuários exceto o admin. */
    public function deleteAll(string $adminEmail): int
    {
        $stmt = $this->db->prepare('DELETE FROM users WHERE email != :email');
        $stmt->execute(['email' => $adminEmail]);
        return (int) $stmt->rowCount();
    }

    public function isBlocked(int $id): bool
    {
        $stmt = $this->db->prepare('SELECT bloqueado FROM users WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row && (bool) $row['bloqueado'];
    }

    public function updatePassword(int $id, string $hash): void
    {
        $this->db->prepare('UPDATE users SET senha = :senha WHERE id = :id')
                 ->execute(['senha' => $hash, 'id' => $id]);
    }

    public function findByGoogleId(string $googleId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM users WHERE google_id = :gid');
        $stmt->execute(['gid' => $googleId]);
        return $stmt->fetch() ?: null;
    }

    public function setGoogleId(int $id, string $googleId): void
    {
        $this->db->prepare('UPDATE users SET google_id = :gid WHERE id = :id')
                 ->execute(['gid' => $googleId, 'id' => $id]);
    }

    public function createWithGoogle(string $nome, string $email, string $googleId): int
    {
        // Senha vazia (impossível de logar via senha normal intencionalmente)
        $stmt = $this->db->prepare(
            'INSERT INTO users (nome, email, senha, google_id) VALUES (:nome, :email, :senha, :gid)'
        );
        $stmt->execute([
            'nome'  => $nome,
            'email' => $email,
            'senha' => '',
            'gid'   => $googleId,
        ]);
        return (int) $this->db->lastInsertId();
    }

    // ── Referral ──────────────────────────────────────────────

    public function findByReferralCode(string $code): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM users WHERE referral_code = :code');
        $stmt->execute(['code' => strtoupper($code)]);
        return $stmt->fetch() ?: null;
    }

    public function setReferralCode(int $id, string $code): void
    {
        $this->db->prepare('UPDATE users SET referral_code = :code WHERE id = :id')
                 ->execute(['code' => $code, 'id' => $id]);
    }

    public function setReferredBy(int $id, int $referrerId): void
    {
        $this->db->prepare('UPDATE users SET referred_by = :ref WHERE id = :id')
                 ->execute(['ref' => $referrerId, 'id' => $id]);
    }

    public function countReferrals(int $id): int
    {
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM users WHERE referred_by = :id');
        $stmt->execute(['id' => $id]);
        return (int) $stmt->fetchColumn();
    }

    private function generateUniqueCode(): string
    {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        do {
            $code = '';
            for ($i = 0; $i < 8; $i++) {
                $code .= $chars[random_int(0, strlen($chars) - 1)];
            }
        } while ($this->findByReferralCode($code));
        return $code;
    }

    public function ensureReferralCode(int $id): string
    {
        $user = $this->findById($id);
        if ($user && !empty($user['referral_code'])) {
            return $user['referral_code'];
        }
        $code = $this->generateUniqueCode();
        $this->setReferralCode($id, $code);
        return $code;
    }
}
