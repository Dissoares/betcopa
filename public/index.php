<?php
declare(strict_types=1);

// Garante que PHP warnings/notices não corrompam respostas JSON
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ob_start();

require_once __DIR__ . '/../src/config.php';
require_once __DIR__ . '/../src/db.php';
require_once __DIR__ . '/../src/utils.php';
require_once __DIR__ . '/../src/logger.php';
require_once __DIR__ . '/../src/csrf.php';
require_once __DIR__ . '/../src/repositories/UserRepository.php';
require_once __DIR__ . '/../src/repositories/GameRepository.php';
require_once __DIR__ . '/../src/repositories/BetRepository.php';
require_once __DIR__ . '/../src/repositories/TransactionRepository.php';
require_once __DIR__ . '/../src/repositories/ConfigRepository.php';
require_once __DIR__ . '/../src/repositories/AdminRepository.php';
require_once __DIR__ . '/../src/repositories/PaymentRepository.php';
require_once __DIR__ . '/../src/repositories/WithdrawalRepository.php';
require_once __DIR__ . '/../src/payments/PaymentGatewayInterface.php';
require_once __DIR__ . '/../src/payments/MercadoPagoGateway.php';
require_once __DIR__ . '/../src/payments/ExpayBrasilGateway.php';
require_once __DIR__ . '/../src/payments/PaymentGatewayFactory.php';
require_once __DIR__ . '/../src/repositories/PasswordResetRepository.php';
require_once __DIR__ . '/../src/services/AuthService.php';
require_once __DIR__ . '/../src/services/Mailer.php';
require_once __DIR__ . '/../src/services/GameService.php';
require_once __DIR__ . '/../src/services/ImageDownloaderService.php';
require_once __DIR__ . '/../src/services/BetService.php';
require_once __DIR__ . '/../src/services/FootballDataService.php';
require_once __DIR__ . '/../src/services/EspnService.php';
require_once __DIR__ . '/../src/controllers/AuthController.php';
require_once __DIR__ . '/../src/controllers/GameController.php';
require_once __DIR__ . '/../src/controllers/BetController.php';
require_once __DIR__ . '/../src/controllers/UserController.php';
require_once __DIR__ . '/../src/controllers/RankingController.php';
require_once __DIR__ . '/../src/controllers/AdminController.php';
require_once __DIR__ . '/../src/controllers/WithdrawalController.php';
require_once __DIR__ . '/../src/controllers/WebhookController.php';
require_once __DIR__ . '/../src/repositories/TicketRepository.php';
require_once __DIR__ . '/../src/controllers/TicketController.php';
require_once __DIR__ . '/../src/repositories/NotificationRepository.php';
require_once __DIR__ . '/../src/controllers/NotificationController.php';
require_once __DIR__ . '/../src/repositories/OnlineRepository.php';

$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

function route(string $path, string $httpMethod, callable $handler): void
{
    global $uri, $method;
    if ($uri === $path && $method === $httpMethod) { $handler(); exit; }
}

function routePattern(string $pattern, string $httpMethod, callable $handler): void
{
    global $uri, $method;
    if ($method !== $httpMethod) return;
    if (preg_match($pattern, $uri, $m)) { $handler((int) $m[1]); exit; }
}

function deps(): array
{
    $db           = Database::connection();
    $users        = new UserRepository($db);
    $games        = new GameRepository($db);
    $bets         = new BetRepository($db);
    $transactions = new TransactionRepository($db);
    $configRepo   = new ConfigRepository($db);
    $adminRepo    = new AdminRepository($db);
    $payments     = new PaymentRepository($db);
    $withdrawals  = new WithdrawalRepository($db);
    $resets       = new PasswordResetRepository($db);
    $ticketsRepo  = new TicketRepository($db);
    $notifsRepo   = new NotificationRepository($db);
    $config       = require __DIR__ . '/../src/config.php';
    return [$users, $games, $bets, $transactions, $config, $configRepo, $adminRepo, $payments, $withdrawals, $resets, $ticketsRepo, $notifsRepo];
}

try {
    if (str_starts_with($uri, '/api/')) {

        if ($uri === '/api/csrf' && $method === 'GET') {
            jsonResponse(['token' => Csrf::token()]);
        }

        [$users, $games, $bets, $transactions, $config, $configRepo, $adminRepo, $payments, $withdrawals, $resets, $ticketsRepo, $notifsRepo] = deps();
        $db = Database::connection();

        $adminEmail = $configRepo->get('admin_email', $config['admin_email']);

        $authService = new AuthService($users, $transactions, $configRepo);
        $mailer      = new Mailer($configRepo);
        $gameService = new GameService($games);
        $betService  = new BetService($bets, $games, $transactions, $config, $configRepo);
        $betService->setPaymentRepository($payments);
        $betService->setMailer($mailer);

        $authCtrl    = new AuthController($authService);
        $authCtrl->setPasswordReset($resets, $mailer);
        $gameCtrl    = new GameController($gameService, $games, $betService, $configRepo, $config);
        $betCtrl     = new BetController($betService, $bets, $configRepo);
        $userCtrl    = new UserController($users, $transactions);
        $rankCtrl    = new RankingController($bets);
        $adminCtrl   = new AdminController($adminRepo, $configRepo, $users, $adminEmail);
        $adminCtrl->setWithdrawalRepository($withdrawals);
        $adminCtrl->setOnlineRepository(new OnlineRepository($db));
        $notifCtrl    = new NotificationController($notifsRepo);
        $ticketCtrl   = new TicketController($ticketsRepo, $adminEmail);
        $ticketCtrl->setNotificationRepository($notifsRepo);
        $withdrawCtrl = new WithdrawalController($withdrawals, $transactions, $configRepo, $adminEmail);
        $withdrawCtrl->setMailer($mailer);
        $webhookCtrl  = new WebhookController($payments, $bets, $transactions, $configRepo);

        // ── Auth ──────────────────────────────────────────────
        route('/api/register',        'POST', fn() => $authCtrl->register());
        route('/api/login',           'POST', fn() => $authCtrl->login());
        route('/api/logout',          'POST', fn() => $authCtrl->logout());
        route('/api/auth/google',     'POST', fn() => $authCtrl->googleLogin());
        route('/api/auth/forgot',     'POST', fn() => $authCtrl->forgotPassword());
        route('/api/auth/reset',      'POST', fn() => $authCtrl->resetPassword());

        // ── Jogos ─────────────────────────────────────────────
        route('/api/jogos',        'GET',  fn() => $gameCtrl->list());
        route('/api/jogos/live',   'GET',  fn() => $gameCtrl->listLive());
        route('/api/admin/jogos',  'POST', fn() => $gameCtrl->create());
        route('/api/admin/import', 'POST', fn() => $gameCtrl->import());
        route('/api/admin/sync',                     'POST', fn() => $gameCtrl->sync());
        route('/api/admin/sync-images',              'POST', fn() => $gameCtrl->syncImages());
        route('/api/admin/jogos/resultado/lote',     'POST', fn() => $gameCtrl->bulkResult());
        route('/api/admin/jogos/excluir/lote',       'POST', fn() => $gameCtrl->bulkDelete());
        route('/api/admin/jogos/excluir/todos',      'POST', fn() => $gameCtrl->deleteAll());
        routePattern('/^\/api\/admin\/jogos\/(\d+)$/', 'PUT',
            fn(int $id) => $gameCtrl->update($id));
        routePattern('/^\/api\/admin\/jogos\/(\d+)\/resultado$/', 'POST',
            fn(int $id) => $gameCtrl->result($id));
        routePattern('/^\/api\/admin\/jogos\/(\d+)$/', 'DELETE',
            fn(int $id) => $gameCtrl->delete($id));

        // ── Apostas ───────────────────────────────────────────
        route('/api/apostas', 'GET',  fn() => $betCtrl->list());
        route('/api/apostas', 'POST', fn() => $betCtrl->create());
        routePattern('/^\/api\/apostas\/(\d+)\/pagar$/',    'POST', fn(int $id) => $betCtrl->pay($id));
        routePattern('/^\/api\/apostas\/(\d+)\/confirmar$/', 'POST', fn(int $id) => $betCtrl->confirm($id));

        // ── User & Ranking ────────────────────────────────────
        route('/api/user',    'GET', fn() => $userCtrl->current());
        route('/api/ranking', 'GET', fn() => $rankCtrl->index());

        // ── Admin: Dashboard ──────────────────────────────────
        route('/api/admin/dashboard',  'GET', fn() => $adminCtrl->dashboard());

        // ── Admin: Usuários ───────────────────────────────────
        route('/api/admin/usuarios', 'GET', fn() => $adminCtrl->listUsers());
        route('/api/admin/usuarios/excluir/lote', 'POST', fn() => $adminCtrl->bulkDeleteUsers());
        route('/api/admin/usuarios/excluir/todos', 'POST', fn() => $adminCtrl->deleteAllUsers());
        routePattern('/^\/api\/admin\/usuarios\/(\d+)\/bloquear$/',   'POST', fn(int $id) => $adminCtrl->blockUser($id));
        routePattern('/^\/api\/admin\/usuarios\/(\d+)\/desbloquear$/', 'POST', fn(int $id) => $adminCtrl->unblockUser($id));

        // ── Admin: Apostas ────────────────────────────────────
        route('/api/admin/apostas',              'GET',  fn() => $adminCtrl->listBets());
        route('/api/admin/apostas/excluir/lote', 'POST', fn() => $adminCtrl->bulkDeleteBets($bets));
        route('/api/admin/apostas/excluir/todos', 'POST', fn() => $adminCtrl->deleteAllBets($bets));

        // ── Config pública (mult range) ───────────────────────────
        route('/api/config/bets',  'GET',  fn() => $adminCtrl->betConfig());
        route('/api/admin/config-public', 'GET', function() use ($configRepo) {
            // Expõe somente as chaves seguras para o frontend público (sem autenticação)
            jsonResponse([
                'google_client_id' => $configRepo->get('google_client_id', ''),
            ]);
        });

        // ── Admin: Configurações ──────────────────────────────
        route('/api/admin/config',       'GET',  fn() => $adminCtrl->getConfig());
        route('/api/admin/config',       'POST', fn() => $adminCtrl->updateConfig());
        route('/api/admin/upload-logo',  'POST', fn() => $adminCtrl->uploadLogo());
        route('/api/admin/delete-logo',  'POST', fn() => $adminCtrl->deleteLogo());
        route('/api/admin/cache/clear',  'POST', fn() => $adminCtrl->clearCache());
        route('/api/admin/reset-data',   'POST', fn() => $adminCtrl->resetData());
        route('/api/admin/online',       'GET',  fn() => $adminCtrl->online());

        // ── Ping de presença (público) ─────────────────────────────────────────
        route('/api/ping', 'POST', function() use ($db) {
            $body = json_decode(file_get_contents('php://input'), true) ?: [];
            $sid  = (string) ($body['session_id'] ?? '');
            if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $sid)) {
                jsonResponse(['ok' => false], 400);
                return;
            }
            if (session_status() === PHP_SESSION_NONE) session_start();
            $userId = isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
            (new OnlineRepository($db))->upsert($sid, $userId);
            jsonResponse(['ok' => true]);
        });
        // ── Admin: Saques ──────────────────────────────────────────────────
        route('/api/admin/saques', 'GET', fn() => $adminCtrl->listWithdrawals());
        routePattern('/^\/api\/admin\/saques\/(\d+)\/aprovar$/', 'POST',  fn(int $id) => $withdrawCtrl->approve($id));
        routePattern('/^\/api\/admin\/saques\/(\d+)\/rejeitar$/', 'POST', fn(int $id) => $withdrawCtrl->reject($id));

        // ── User: Saques ───────────────────────────────────────────────────
        route('/api/user/saques', 'GET',  fn() => $withdrawCtrl->list());
        route('/api/user/saques', 'POST', fn() => $withdrawCtrl->request());

        // ── Notificações ──────────────────────────────────────────────────
        route('/api/notifications',          'GET',  fn() => $notifCtrl->list());
        route('/api/notifications/read-all', 'POST', fn() => $notifCtrl->markAllRead());
        routePattern('/^\/api\/notifications\/(\d+)\/read$/', 'POST', fn(int $id) => $notifCtrl->markRead($id));

        // ── Tickets (suporte) ─────────────────────────────────────────────
        route('/api/tickets',            'GET',  fn() => $ticketCtrl->listMine());
        route('/api/tickets',            'POST', fn() => $ticketCtrl->create());
        route('/api/admin/tickets',      'GET',  fn() => $ticketCtrl->listAll());
        routePattern('/^\/api\/tickets\/(\d+)$/',                    'GET',  fn(int $id) => $ticketCtrl->show($id));
        routePattern('/^\/api\/tickets\/(\d+)\/messages$/',          'POST', fn(int $id) => $ticketCtrl->sendMessage($id));
        routePattern('/^\/api\/admin\/tickets\/(\d+)\/status$/',     'POST', fn(int $id) => $ticketCtrl->updateStatus($id));

        // ── Feed público ─────────────────────────────────────────────────
        route('/api/feed', 'GET', function() use ($bets) {
            $wins = $bets->recentWins(15);
            $feed = [];
            foreach ($wins as $w) {
                $parts  = explode(' ', trim($w['nome']));
                $nome   = $parts[0] . (isset($parts[1]) ? ' ' . mb_substr($parts[1], 0, 1, 'UTF-8') . '.' : '');
                $feed[] = [
                    'nome'        => $nome,
                    'valor_ganho' => (float) $w['possivel_ganho'],
                    'time_casa'   => $w['time_casa'],
                    'time_fora'   => $w['time_fora'],
                    'placar_real' => $w['placar_real'],
                ];
            }
            jsonResponse(['feed' => $feed]);
        });

        // ── Webhooks ─────────────────────────────────────────────────────
        route('/api/webhooks/mercadopago', 'POST', fn() => $webhookCtrl->mercadopago());
        route('/api/webhooks/expay',         'POST', fn() => $webhookCtrl->expay());
        jsonResponse(['error' => 'Rota não encontrada'], 404);
    }

    $db  = Database::connection();
    $ver = (new ConfigRepository($db))->get('cache_version', '1');
    $html = file_get_contents(__DIR__ . '/../public/template.html');
    $html = preg_replace('/(\?v=)\d+/', '$1' . $ver, $html);
    echo $html;

} catch (Throwable $e) {
    Logger::error($e->getMessage(), ['trace' => $e->getTraceAsString()]);
    jsonResponse(['error' => $e->getMessage()], 500);
}
