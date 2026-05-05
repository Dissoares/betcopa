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
require_once __DIR__ . '/../src/services/AuthService.php';
require_once __DIR__ . '/../src/services/GameService.php';
require_once __DIR__ . '/../src/services/BetService.php';
require_once __DIR__ . '/../src/services/FootballDataService.php';
require_once __DIR__ . '/../src/controllers/AuthController.php';
require_once __DIR__ . '/../src/controllers/GameController.php';
require_once __DIR__ . '/../src/controllers/BetController.php';
require_once __DIR__ . '/../src/controllers/UserController.php';
require_once __DIR__ . '/../src/controllers/RankingController.php';
require_once __DIR__ . '/../src/controllers/AdminController.php';

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
    $config       = require __DIR__ . '/../src/config.php';
    return [$users, $games, $bets, $transactions, $config, $configRepo, $adminRepo];
}

try {
    if (str_starts_with($uri, '/api/')) {

        if ($uri === '/api/csrf' && $method === 'GET') {
            jsonResponse(['token' => Csrf::token()]);
        }

        [$users, $games, $bets, $transactions, $config, $configRepo, $adminRepo] = deps();

        $adminEmail = $configRepo->get('admin_email', $config['admin_email']);

        $authService = new AuthService($users, $transactions);
        $gameService = new GameService($games);
        $betService  = new BetService($bets, $games, $transactions, $config, $configRepo);

        $authCtrl    = new AuthController($authService);
        $gameCtrl    = new GameController($gameService, $games, $betService, $configRepo, $config);
        $betCtrl     = new BetController($betService, $bets);
        $userCtrl    = new UserController($users, $transactions);
        $rankCtrl    = new RankingController($bets);
        $adminCtrl   = new AdminController($adminRepo, $configRepo, $users, $adminEmail);

        // ── Auth ──────────────────────────────────────────────
        route('/api/register', 'POST', fn() => $authCtrl->register());
        route('/api/login',    'POST', fn() => $authCtrl->login());
        route('/api/logout',   'POST', fn() => $authCtrl->logout());

        // ── Jogos ─────────────────────────────────────────────
        route('/api/jogos',        'GET',  fn() => $gameCtrl->list());
        route('/api/admin/jogos',  'POST', fn() => $gameCtrl->create());
        route('/api/admin/import', 'POST', fn() => $gameCtrl->import());
        route('/api/admin/sync',   'POST', fn() => $gameCtrl->sync());
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
        routePattern('/^\/api\/admin\/usuarios\/(\d+)\/bloquear$/',   'POST', fn(int $id) => $adminCtrl->blockUser($id));
        routePattern('/^\/api\/admin\/usuarios\/(\d+)\/desbloquear$/', 'POST', fn(int $id) => $adminCtrl->unblockUser($id));

        // ── Admin: Apostas ────────────────────────────────────
        route('/api/admin/apostas', 'GET', fn() => $adminCtrl->listBets());

        // ── Config pública (mult range) ───────────────────────────
        route('/api/config/bets',  'GET',  fn() => $adminCtrl->betConfig());

        // ── Admin: Configurações ──────────────────────────────
        route('/api/admin/config', 'GET',  fn() => $adminCtrl->getConfig());
        route('/api/admin/config', 'POST', fn() => $adminCtrl->updateConfig());

        jsonResponse(['error' => 'Rota não encontrada'], 404);
    }

    echo file_get_contents(__DIR__ . '/../public/template.html');

} catch (Throwable $e) {
    Logger::error($e->getMessage(), ['trace' => $e->getTraceAsString()]);
    jsonResponse(['error' => $e->getMessage()], 500);
}
