<?php
class AdminController
{
    private AdminRepository   $admin;
    private ConfigRepository  $config;
    private UserRepository    $users;
    private string            $adminEmail;
    private ?WithdrawalRepository $withdrawals = null;
    private ?OnlineRepository $online = null;

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

    public function setWithdrawalRepository(WithdrawalRepository $repo): void
    {
        $this->withdrawals = $repo;
    }

    public function setOnlineRepository(OnlineRepository $repo): void
    {
        $this->online = $repo;
    }

    // ── Dashboard ─────────────────────────────────────────────
    public function dashboard(): void
    {
        ensureAdmin($this->adminEmail);
        $limit      = 10;
        $betsPage   = max(1, (int) ($_GET['bets_page']  ?? 1));
        $gamesPage  = max(1, (int) ($_GET['games_page'] ?? 1));

        $stats   = $this->admin->dashboardStats();
        $recent  = $this->admin->recentBets($limit, ($betsPage  - 1) * $limit);
        $byGame  = $this->admin->betStatsByGame($gamesPage, $limit);

        jsonResponse([
            'stats'       => $stats,
            'recentes'    => $recent,
            'total_bets'  => $this->admin->countBets(),
            'por_jogo'    => $byGame,
            'total_jogos' => $this->admin->countGames(),
            'bets_page'   => $betsPage,
            'games_page'  => $gamesPage,
            'limit'       => $limit,
        ]);
    }

    // ── Usuários ──────────────────────────────────────────────
    public function listUsers(): void
    {
        ensureAdmin($this->adminEmail);
        $page  = max(1, (int) ($_GET['page']  ?? 1));
        $limit = max(10, min(200, (int) ($_GET['limit'] ?? 50)));
        jsonResponse([
            'usuarios' => $this->admin->listUsers($page, $limit),
            'total'    => $this->admin->countUsers(),
            'page'     => $page,
            'limit'    => $limit,
        ]);
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
        $jogoId = (int)    ($_GET['jogo_id'] ?? 0);
        $status = (string) ($_GET['status']  ?? '');
        $page   = max(1, (int) ($_GET['page']  ?? 1));
        $limit  = max(10, min(200, (int) ($_GET['limit'] ?? 50)));
        jsonResponse([
            'apostas' => $this->admin->listBets($jogoId, $status, $page, $limit),
            'total'   => $this->admin->countBets($jogoId, $status),
            'page'    => $page,
            'limit'   => $limit,
        ]);
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
            'odd_padrao'       => (float) $this->config->get('odd_padrao',          5.00),
            'stake_min'        => (float) $this->config->get('stake_min',          5.00),
            'stake_max'        => (float) $this->config->get('stake_max',          500.00),
            'site_logo'        =>         $this->config->get('site_logo',          ''),
            'site_nome'        =>         $this->config->get('site_nome',          'BetCopa'),
            'site_title'       =>         $this->config->get('site_title',         'BetCopa | Acerte o Placar. Ganhe de Verdade.'),
            'site_description' =>         $this->config->get('site_description',   'Faça seu palpite no placar exato, escolha seu multiplicador e leve o prêmio para casa. Copa do Mundo 2026 — rápido, seguro e confiável.'),
            'admin_email'      =>         $this->adminEmail,
            'bonus_cadastro'   => (float) $this->config->get('bonus_cadastro',     0),
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
            'odd_padrao', 'stake_min', 'stake_max',
            'max_aposta', 'max_ganho',
            'gateway_ativo', 'mp_access_token', 'mp_webhook_secret',
            'expay_merchant_key',
            'google_client_id',
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

    // ── Saques ─────────────────────────────────────────────────────────────────────────
    public function listWithdrawals(): void
    {
        ensureAdmin($this->adminEmail);
        $saques = $this->withdrawals ? $this->withdrawals->listAll() : [];
        jsonResponse(['saques' => $saques]);
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

    public function online(): void
    {
        ensureAdmin($this->adminEmail);
        $stats = $this->online ? $this->online->stats() : ['total' => 0, 'usuarios' => 0, 'visitantes' => 0];
        $users = $this->online ? $this->online->listOnlineUsers() : [];
        jsonResponse(['stats' => $stats, 'usuarios_online' => $users]);
    }

    public function clearCache(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);
        $next = (int) $this->config->get('cache_version', '1') + 1;
        $this->config->set('cache_version', (string) $next);
        Logger::info('Cache limpo', ['version' => $next]);
        jsonResponse(['message' => 'Cache limpo com sucesso.', 'version' => $next]);
    }
}
