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
            'mult_min', 'mult_max',
            'max_aposta', 'max_ganho',
            'saques_ativos',
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
}
