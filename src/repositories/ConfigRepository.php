<?php
class ConfigRepository
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function get(string $key, string $default = ''): string
    {
        $stmt = $this->db->prepare('SELECT valor FROM configuracoes WHERE chave = :chave');
        $stmt->execute(['chave' => $key]);
        $row = $stmt->fetch();
        return $row ? $row['valor'] : $default;
    }

    public function all(): array
    {
        $stmt = $this->db->query('SELECT chave, valor, descricao FROM configuracoes ORDER BY chave');
        $rows = $stmt->fetchAll();
        $result = [];
        foreach ($rows as $row) {
            $result[$row['chave']] = ['valor' => $row['valor'], 'descricao' => $row['descricao']];
        }
        return $result;
    }

    public function set(string $key, string $value): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO configuracoes (chave, valor) VALUES (:chave, :valor)
             ON DUPLICATE KEY UPDATE valor = :valor2'
        );
        $stmt->execute(['chave' => $key, 'valor' => $value, 'valor2' => $value]);
    }

    public function bulkSet(array $data): void
    {
        foreach ($data as $key => $value) {
            $this->set($key, (string) $value);
        }
    }
}
