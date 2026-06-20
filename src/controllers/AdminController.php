<?php
class AdminController
{
    private AdminRepository   $admin;
    private ConfigRepository  $config;
    private UserRepository    $users;
    private string            $adminEmail;
    private ?WithdrawalRepository   $withdrawals  = null;
    private ?OnlineRepository       $online       = null;
    private ?AnalyticsRepository    $analytics    = null;
    private ?TransactionRepository  $transactions  = null;
    private ?SessionEventRepository $sessionEvents = null;

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

    public function setTransactionRepository(TransactionRepository $repo): void
    {
        $this->transactions = $repo;
    }

    public function setWithdrawalRepository(WithdrawalRepository $repo): void
    {
        $this->withdrawals = $repo;
    }

    public function setOnlineRepository(OnlineRepository $repo): void
    {
        $this->online = $repo;
    }

    public function setSessionEventRepository(SessionEventRepository $repo): void
    {
        $this->sessionEvents = $repo;
    }

    public function setAnalyticsRepository(AnalyticsRepository $repo): void
    {
        $this->analytics = $repo;
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
            'stats'           => $stats,
            'recentes'        => $recent,
            'total_bets'      => $this->admin->countBets(),
            'por_jogo'        => $byGame,
            'total_jogos'     => $this->admin->countGames(),
            'bets_page'       => $betsPage,
            'games_page'      => $gamesPage,
            'limit'           => $limit,
            'novos_usuarios'  => $this->admin->newUsers(5),
            'top_gastadores'  => $this->admin->topSpenders(5),
            'top_ganhadores'  => $this->admin->topWinners(5),
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

    public function listSeedUsers(): void
    {
        ensureAdmin($this->adminEmail);
        $page  = max(1, (int) ($_GET['page']  ?? 1));
        $limit = max(10, min(200, (int) ($_GET['limit'] ?? 50)));
        jsonResponse([
            'usuarios' => $this->admin->listSeedUsers($page, $limit),
            'total'    => $this->admin->countSeedUsers(),
            'page'     => $page,
            'limit'    => $limit,
        ]);
    }

    public function deleteAllSeedUsers(): void
    {
        ensureAdmin($this->adminEmail);
        Csrf::verify();
        $count = $this->admin->deleteAllSeedUsers();
        jsonResponse(['ok' => true, 'deleted' => $count]);
    }

    public function seedRanking(): void
    {
        ensureAdmin($this->adminEmail);
        Csrf::verify();
        $gameId = (int) ($_POST['game_id'] ?? 0);
        $result = (new RankingSeedService(Database::connection()))->run($gameId);
        jsonResponse($result);
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

    public function toggleAdmin(int $id): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);
        $body    = json_decode(file_get_contents('php://input'), true) ?: [];
        $makeAdmin = !empty($body['is_admin']);
        $this->users->setAdmin($id, $makeAdmin);
        Logger::info($makeAdmin ? 'Usuário promovido a admin' : 'Admin removido', ['id' => $id]);
        jsonResponse(['message' => $makeAdmin ? 'Usuário promovido a admin.' : 'Permissão de admin removida.']);
    }

    public function changeUserPassword(int $id): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);
        $body  = json_decode(file_get_contents('php://input'), true) ?: [];
        $senha = trim((string) ($body['senha'] ?? ''));
        if (mb_strlen($senha) < 6) {
            jsonResponse(['error' => 'A senha deve ter no mínimo 6 caracteres.'], 422);
            return;
        }
        $this->users->updatePassword($id, password_hash($senha, PASSWORD_BCRYPT));
        Logger::info('Senha alterada pelo admin', ['user_id' => $id]);
        jsonResponse(['message' => 'Senha alterada com sucesso.']);
    }

    public function adjustBonus(int $id): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);
        if ($this->transactions === null) {
            jsonResponse(['error' => 'Serviço de transações não disponível.'], 500); return;
        }
        $body  = json_decode(file_get_contents('php://input'), true) ?: [];
        $valor = round((float) ($body['valor'] ?? 0), 2);
        $obs   = trim((string) ($body['obs'] ?? ''));
        if ($valor === 0.0) {
            jsonResponse(['error' => 'Informe um valor diferente de zero.'], 422); return;
        }
        $user = $this->users->findById($id);
        if (!$user) { jsonResponse(['error' => 'Usuário não encontrado.'], 404); return; }

        $tipo     = $valor > 0 ? 'credito' : 'debito';
        $descricao = ($valor > 0 ? 'Bônus adicionado' : 'Bônus removido') . ' pelo admin'
                   . ($obs !== '' ? ": {$obs}" : '');
        $this->transactions->create($id, $tipo, abs($valor), $descricao);
        Logger::info('Bônus ajustado pelo admin', ['user_id' => $id, 'valor' => $valor]);
        jsonResponse(['message' => 'Saldo ajustado com sucesso.']);
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

    public function bulkDeleteUsers(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        $ids  = array_filter(array_map('intval', $body['ids'] ?? []), fn($id) => $id > 0);

        if (empty($ids)) {
            jsonResponse(['error' => 'Nenhum usuário selecionado.'], 400);
            return;
        }

        $deleted = $this->users->deleteMany(array_values($ids), $this->adminEmail);
        $skipped = count($ids) - count($deleted);

        Logger::info('Usuários excluídos em lote', ['excluidos' => count($deleted), 'ignorados' => $skipped]);
        jsonResponse([
            'message'   => count($deleted) . ' usuário(s) excluído(s).' . ($skipped > 0 ? " {$skipped} ignorado(s) (conta admin)." : ''),
            'excluidos' => count($deleted),
        ]);
    }

    public function deleteAllUsers(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $count = $this->users->deleteAll($this->adminEmail);
        Logger::info('Todos os usuários excluídos', ['total' => $count]);
        jsonResponse(['message' => "{$count} usuário(s) excluído(s). Conta admin preservada.", 'excluidos' => $count]);
    }

    public function deleteAllBets(BetRepository $bets): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $count = $bets->deleteAll();
        Logger::info('Todas as apostas excluídas', ['total' => $count]);
        jsonResponse(['message' => "{$count} aposta(s) excluída(s).", 'excluidas' => $count]);
    }

    public function bulkDeleteBets(BetRepository $bets): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        $ids  = array_filter(array_map('intval', $body['ids'] ?? []), fn($id) => $id > 0);

        if (empty($ids)) {
            jsonResponse(['error' => 'Nenhuma aposta selecionada.'], 400);
            return;
        }

        $deleted = $bets->deleteMany(array_values($ids));
        $skipped = count($ids) - count($deleted);

        Logger::info('Apostas excluídas em lote', ['excluidas' => count($deleted), 'ignoradas' => $skipped]);
        jsonResponse([
            'message'   => count($deleted) . ' aposta(s) excluída(s).' . ($skipped > 0 ? " {$skipped} ignorada(s) (pago/ganhou/perdido)." : ''),
            'excluidas' => count($deleted),
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
            'site_description' =>         $this->config->get('site_description',   'Faça seu palpite e acerte o placar exato dos jogos da copa do mundo.'),
            'admin_email'      =>         $this->adminEmail,
            'bonus_cadastro'   => (float) $this->config->get('bonus_cadastro',     0),
            'pix_ativo'        => (int)   $this->config->get('pix_ativo',          '1'),
            'expay_ativo'      => (int)   $this->config->get('expay_ativo',        '1'),
            'pix_logo'         =>         $this->config->get('pix_logo',           '/assets/logos/pix.png'),
            'expay_logo'       =>         $this->config->get('expay_logo',         '/assets/logos/expay.png'),
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
            'pix_ativo', 'expay_ativo',
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

    public function uploadPaymentLogo(): void
    {
        ensureAdmin($this->adminEmail);

        $method  = $_POST['method'] ?? '';
        $allowed = ['pix' => 'pix_logo', 'expay' => 'expay_logo'];
        if (!isset($allowed[$method])) {
            jsonResponse(['error' => 'Método inválido.'], 400);
        }
        $configKey = $allowed[$method];

        if (empty($_FILES['logo'])) {
            jsonResponse(['error' => 'Nenhum arquivo enviado.'], 400);
        }

        $file    = $_FILES['logo'];
        $maxSize = 2 * 1024 * 1024;

        if ($file['error'] !== UPLOAD_ERR_OK) {
            jsonResponse(['error' => 'Erro no upload: código ' . $file['error']], 400);
        }
        if ($file['size'] > $maxSize) {
            jsonResponse(['error' => 'Arquivo muito grande. Máximo 2 MB.'], 400);
        }

        $mime = mime_content_type($file['tmp_name']);
        $mimeMap = ['image/png' => 'png', 'image/jpeg' => 'jpg',
                    'image/gif' => 'gif', 'image/webp' => 'webp',
                    'image/svg+xml' => 'svg'];
        if (!isset($mimeMap[$mime])) {
            jsonResponse(['error' => 'Use PNG, JPG, GIF, WEBP ou SVG.'], 400);
        }

        $ext       = $mimeMap[$mime];
        $filename  = 'payment_' . $method . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
        $uploadDir = __DIR__ . '/../../public/assets/uploads/';
        $destPath  = $uploadDir . $filename;

        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        // Remove logo anterior se for de upload
        $old = $this->config->get($configKey, '');
        if ($old && str_starts_with($old, '/assets/uploads/')) {
            $oldFile = __DIR__ . '/../../public' . $old;
            if (is_file($oldFile)) @unlink($oldFile);
        }

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            jsonResponse(['error' => 'Falha ao salvar o arquivo.'], 500);
        }

        $url = '/assets/uploads/' . $filename;
        $this->config->set($configKey, $url);

        jsonResponse(['url' => $url, 'method' => $method, 'message' => 'Logo atualizado.']);
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
        $stats    = $this->online ? $this->online->stats()           : ['total' => 0, 'usuarios' => 0, 'visitantes' => 0];
        $users    = $this->online ? $this->online->listOnlineUsers() : [];
        $sessions = $this->online ? $this->online->listAllSessions() : [];
        jsonResponse(['stats' => $stats, 'usuarios_online' => $users, 'sessoes_online' => $sessions]);
    }

    public function analyticsData(): void
    {
        ensureAdmin($this->adminEmail);
        if (!$this->analytics) { jsonResponse(['error' => 'Analytics não disponível'], 503); return; }

        $period = $_GET['period'] ?? 'today';
        if (!in_array($period, ['today', 'week', 'month'], true)) $period = 'today';
        $page  = max(1, (int) ($_GET['page']  ?? 1));
        $limit = 50;

        $online = $this->online ? $this->online->stats() : ['total' => 0, 'usuarios' => 0, 'visitantes' => 0];

        jsonResponse([
            'period'       => $period,
            'online_now'   => $online,
            'stats'        => $this->analytics->getStats($period),
            'by_source'    => $this->analytics->getBySource($period),
            'by_country'   => $this->analytics->getByCountry($period),
            'by_device'    => $this->analytics->getByDevice($period),
            'by_browser'   => $this->analytics->getByBrowser($period),
            'by_os'        => $this->analytics->getByOS($period),
            'by_page'      => $this->analytics->getByPage($period),
            'visits'       => $this->analytics->getVisitsGroupedByIP($period, $page, $limit),
            'total_visits' => $this->analytics->countVisitsByIP($period),
            'page'         => $page,
            'limit'        => $limit,
        ]);
    }

    public function analyticsDeleteIP(): void
    {
        ensureAdmin($this->adminEmail);
        if (!$this->analytics) { jsonResponse(['error' => 'Analytics não disponível'], 503); return; }
        $ip = trim($_GET['ip'] ?? '');
        if (!$ip) { jsonResponse(['error' => 'IP não informado'], 400); return; }
        $deleted = $this->analytics->deleteByIP($ip);
        jsonResponse(['ok' => true, 'deleted' => $deleted]);
    }

    public function analyticsIPHistory(): void
    {
        ensureAdmin($this->adminEmail);
        if (!$this->analytics) { jsonResponse(['error' => 'Analytics não disponível'], 503); return; }
        $ip = trim($_GET['ip'] ?? '');
        if (!$ip) { jsonResponse(['error' => 'IP não informado'], 400); return; }

        $sessions   = $this->analytics->getSessionsByIP($ip);
        $sessionIds = array_column($sessions, 'session_id');

        if ($sessionIds && $this->sessionEvents) {
            $allEvts = $this->sessionEvents->getBySessionIds($sessionIds);
            $evtMap  = [];
            foreach ($allEvts as $ev) {
                $evtMap[$ev['session_id']][] = $ev;
            }
            foreach ($sessions as &$s) {
                $s['events'] = $evtMap[$s['session_id']] ?? [];
            }
            unset($s);
        }

        jsonResponse(['sessions' => $sessions]);
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

    public function seedExampleBets(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $db = Database::connection();

        $seedUsers = [
            ['Carlos Silva',    'carlos.seed@betcopa.local'],
            ['Maria Oliveira',  'maria.seed@betcopa.local'],
            ['João Pereira',    'joao.seed@betcopa.local'],
            ['Ana Lima',        'ana.seed@betcopa.local'],
            ['Pedro Mendes',    'pedro.seed@betcopa.local'],
            ['Fernanda Costa',  'fernanda.seed@betcopa.local'],
            ['Lucas Rocha',     'lucas.seed@betcopa.local'],
            ['Beatriz Nunes',   'beatriz.seed@betcopa.local'],
            ['Ricardo Alves',   'ricardo.seed@betcopa.local'],
            ['Camila Ferreira', 'camila.seed@betcopa.local'],
        ];

        $hash    = password_hash('betcopa123', PASSWORD_BCRYPT);
        $chkUser = $db->prepare('SELECT id FROM users WHERE email = ?');
        $insUser = $db->prepare('INSERT INTO users (nome, email, senha) VALUES (?, ?, ?)');

        $userIds = [];
        foreach ($seedUsers as [$nome, $email]) {
            $chkUser->execute([$email]);
            $id = $chkUser->fetchColumn();
            if (!$id) {
                $insUser->execute([$nome, $email, $hash]);
                $id = (int) $db->lastInsertId();
            }
            $userIds[] = (int) $id;
        }

        $games = $db->query(
            "SELECT id, placar_real, odd FROM jogos
              WHERE status = 'finalizado'
                AND placar_real IS NOT NULL AND placar_real != ''
              ORDER BY data_hora DESC LIMIT 12"
        )->fetchAll(PDO::FETCH_ASSOC);

        if (empty($games)) {
            jsonResponse(['error' => 'Nenhum jogo finalizado com placar encontrado.'], 422);
            return;
        }

        $ph = implode(',', array_fill(0, count($userIds), '?'));
        $db->prepare("DELETE FROM apostas WHERE user_id IN ($ph)")->execute($userIds);

        $insBet  = $db->prepare(
            'INSERT INTO apostas (user_id, jogo_id, placar_casa, placar_fora, valor, odd, possivel_ganho, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $valores = [50, 100, 30, 75, 20, 200, 15, 80, 40, 60];
        $offsets = [[1,0],[0,1],[-1,0],[1,1]];
        $total   = 0;

        foreach ($games as $i => $g) {
            [$rc, $rf] = array_map('intval', explode('x', $g['placar_real']));
            $odd    = max((float) $g['odd'], 2.00);
            $gameId = (int) $g['id'];

            foreach ([($i*2)%10, ($i*2+1)%10] as $j) {
                $val = $valores[$j];
                $insBet->execute([$userIds[$j], $gameId, $rc, $rf, $val, round($odd,2), round($val*$odd,2), 'ganhou']);
                $total++;
            }
            foreach ([($i+2)%10, ($i+3)%10, ($i+4)%10, ($i+5)%10] as $k => $j) {
                [$oc, $of] = $offsets[$k];
                $pc = max(0, $rc + $oc); $pf = max(0, $rf + $of);
                if ($pc === $rc && $pf === $rf) $pc++;
                $val = $valores[$j];
                $insBet->execute([$userIds[$j], $gameId, $pc, $pf, $val, round($odd,2), round($val*$odd,2), 'perdido']);
                $total++;
            }
        }

        Logger::info('Apostas de exemplo inseridas', ['total' => $total, 'jogos' => count($games)]);
        jsonResponse(['message' => "Apostas de exemplo inseridas: {$total} apostas em " . count($games) . " jogos."]);
    }
}
