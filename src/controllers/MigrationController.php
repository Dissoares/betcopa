<?php
class MigrationController
{
    private PDO $db;
    private string $sqlDir;
    private string $adminEmail;

    public function __construct(PDO $db, string $adminEmail)
    {
        $this->db         = $db;
        $this->adminEmail = $adminEmail;
        $this->sqlDir     = dirname(__DIR__, 2) . '/sql';
        $this->ensureTable();
    }

    private function ensureTable(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS migrations (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                filename   VARCHAR(255) NOT NULL UNIQUE,
                ran_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
    }

    private function requireAdmin(): void
    {
        ensureAdmin($this->adminEmail);
    }

    private function getFiles(): array
    {
        $files = glob($this->sqlDir . '/migration_*.sql');
        if (!$files) return [];
        sort($files); // alphabetical = chronological for migration_v2, v3... + migration_referral
        return array_map('basename', $files);
    }

    private function getRan(): array
    {
        $rows = $this->db->query("SELECT filename FROM migrations")->fetchAll(PDO::FETCH_COLUMN);
        return array_flip($rows);
    }

    public function list(): void
    {
        $this->requireAdmin();

        $files = $this->getFiles();
        $ran   = $this->getRan();

        $result = [];
        foreach ($files as $f) {
            $result[] = [
                'filename' => $f,
                'status'   => isset($ran[$f]) ? 'executado' : 'pendente',
            ];
        }

        header('Content-Type: application/json');
        echo json_encode($result);
    }

    public function run(): void
    {
        $this->requireAdmin();

        $body = json_decode(file_get_contents('php://input'), true);
        $file = basename($body['filename'] ?? '');

        if (!$file || !preg_match('/^migration_[\w\-]+\.sql$/', $file)) {
            http_response_code(400);
            echo json_encode(['error' => 'Arquivo inválido']);
            return;
        }

        $path = $this->sqlDir . '/' . $file;
        if (!file_exists($path)) {
            http_response_code(404);
            echo json_encode(['error' => 'Arquivo não encontrado']);
            return;
        }

        $ran = $this->getRan();
        if (isset($ran[$file])) {
            echo json_encode(['ok' => true, 'message' => 'Já executado anteriormente']);
            return;
        }

        $sql = file_get_contents($path);

        // Strip comment lines and split by ;
        $lines  = explode("\n", $sql);
        $clean  = implode("\n", array_filter($lines, fn($l) => !str_starts_with(trim($l), '--')));
        $stmts  = array_filter(array_map('trim', explode(';', $clean)));

        $this->db->beginTransaction();
        try {
            foreach ($stmts as $stmt) {
                $this->db->exec($stmt);
            }
            $ins = $this->db->prepare("INSERT INTO migrations (filename) VALUES (?)");
            $ins->execute([$file]);
            $this->db->commit();
            header('Content-Type: application/json');
            echo json_encode(['ok' => true, 'message' => "Migration '$file' executada com sucesso"]);
        } catch (Throwable $e) {
            $this->db->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }
}
