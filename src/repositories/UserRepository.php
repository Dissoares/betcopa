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
}
