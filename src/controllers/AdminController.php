<?php
class AdminController
{
    private AdminRepository  $admin;
    private ConfigRepository $config;
    private UserRepository   $users;
    private string           $adminEmail;

    public function __construct(
        AdminRepository  $admin,
        ConfigRepository $config,
        UserRepository   $users,
        string           $adminEmail
    ) {
        $this->admin      = $admin;
        $this->config     = $config;
        $this->users      = $users;
        $this->adminEmail = $adminEmail;
    }

    // ── Dashboard ─────────────────────────────────────────────
    public function dashboard(): void
    {
        ensureAdmin($this->adminEmail);
        $stats   = $this->admin->dashboardStats();
        $recent  = $this->admin->recentBets(8);
        $byGame  = $this->admin->betStatsByGame();
        jsonResponse([
            'stats'   => $stats,
            'recentes' => $recent,
            'por_jogo' => $byGame,
        ]);
    }

    // ── Usuários ──────────────────────────────────────────────
    public function listUsers(): void
    {
        ensureAdmin($this->adminEmail);
        jsonResponse(['usuarios' => $this->admin->listUsers()]);
    }

    public function blockUser(int $id): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);
        $this->users->block($id);
        Logger::info('Usuário bloqueado', ['id' => $id]);
        jsonResponse(['message' => 'Usuário bloqueado.']);
    }

    public function unblockUser(int $id): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);
        $this->users->unblock($id);
        Logger::info('Usuário desbloqueado', ['id' => $id]);
        jsonResponse(['message' => 'Usuário desbloqueado.']);
    }

    // ── Apostas ───────────────────────────────────────────────
    public function listBets(): void
    {
        ensureAdmin($this->adminEmail);
        $jogoId = (int) ($_GET['jogo_id'] ?? 0);
        $status = $_GET['status'] ?? '';
        $bets   = $this->admin->listBets($jogoId, $status);
        jsonResponse(['apostas' => $bets]);
    }

    // ── Configurações ─────────────────────────────────────────
    public function getConfig(): void
    {
        ensureAdmin($this->adminEmail);
        jsonResponse(['config' => $this->config->all()]);
    }

    /** Endpoint público — expõe parâmetros de aposta para o frontend */
    public function betConfig(): void
    {
        jsonResponse([
            'mult_min'    => (int)   $this->config->get('mult_min',    1),
            'mult_max'    => (int)   $this->config->get('mult_max',    100),
            'bet_percent' => (float) $this->config->get('bet_percent', 10),
            'site_logo'   =>         $this->config->get('site_logo',   ''),
            'site_nome'   =>         $this->config->get('site_nome',   'BetCopa'),
        ]);
    }

    public function updateConfig(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $body    = json_decode(file_get_contents('php://input'), true) ?: [];
        $allowed = [
            'site_nome', 'site_emoji', 'site_title', 'site_description', 'site_keywords',
            'maintenance_mode', 'admin_email', 'user_registration_enabled',
            'api_football_key', 'api_football_timezone',
            'pix_tipo', 'pix_chave', 'pix_nome',
            'bonus_cadastro', 'valor_base_padrao',
            'mult_min', 'mult_max', 'bet_percent',
            'max_aposta', 'max_ganho',
            'saques_ativos',
            'site_logo',
        ];

        $saved = [];
        foreach ($allowed as $key) {
            if (array_key_exists($key, $body)) {
                $this->config->set($key, (string) $body[$key]);
                $saved[] = $key;
            }
        }

        Logger::info('Configurações atualizadas', ['chaves' => $saved]);
        jsonResponse(['message' => count($saved) . ' configuração(ões) salva(s).']);
    }

    public function uploadLogo(): void
    {
        ensureAdmin($this->adminEmail);

        if (empty($_FILES['logo'])) {
            jsonResponse(['error' => 'Nenhum arquivo enviado.'], 400);
        }

        $file    = $_FILES['logo'];
        $maxSize = 2 * 1024 * 1024; // 2 MB

        if ($file['error'] !== UPLOAD_ERR_OK) {
            jsonResponse(['error' => 'Erro no upload: código ' . $file['error']], 400);
        }

        if ($file['size'] > $maxSize) {
            jsonResponse(['error' => 'Arquivo muito grande. Máximo 2 MB.'], 400);
        }

        // Validar tipo real pelo conteúdo (não pelo nome)
        $mime = mime_content_type($file['tmp_name']);
        $allowed = ['image/png' => 'png', 'image/jpeg' => 'jpg',
                    'image/gif' => 'gif', 'image/webp' => 'webp',
                    'image/svg+xml' => 'svg'];

        if (!isset($allowed[$mime])) {
            jsonResponse(['error' => 'Tipo de arquivo não permitido. Use PNG, JPG, GIF, WEBP ou SVG.'], 400);
        }

        $ext      = $allowed[$mime];
        $filename = 'logo_' . bin2hex(random_bytes(8)) . '.' . $ext;
        $uploadDir = __DIR__ . '/../../public/assets/uploads/';
        $destPath  = $uploadDir . $filename;

        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        // Apagar logo anterior (se existir e for da pasta de uploads)
        $oldLogo = $this->config->get('site_logo', '');
        if ($oldLogo && str_starts_with($oldLogo, '/assets/uploads/')) {
            $oldFile = __DIR__ . '/../../public' . $oldLogo;
            if (is_file($oldFile)) {
                @unlink($oldFile);
            }
        }

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            jsonResponse(['error' => 'Falha ao salvar o arquivo no servidor.'], 500);
        }

        $url = '/assets/uploads/' . $filename;
        $this->config->set('site_logo', $url);

        jsonResponse(['url' => $url, 'message' => 'Logo enviado com sucesso.']);
    }

    public function deleteLogo(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $current = $this->config->get('site_logo', '');
        if ($current && str_starts_with($current, '/assets/uploads/')) {
            $path = __DIR__ . '/../../public' . $current;
            if (is_file($path)) {
                @unlink($path);
            }
        }

        $this->config->set('site_logo', '');
        jsonResponse(['message' => 'Logo removido.']);
    }
}
