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
}
