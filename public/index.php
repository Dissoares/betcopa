<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/config.php';
require_once __DIR__ . '/../src/db.php';
require_once __DIR__ . '/../src/utils.php';
require_once __DIR__ . '/../src/logger.php';
require_once __DIR__ . '/../src/csrf.php';
require_once __DIR__ . '/../src/repositories/UserRepository.php';
require_once __DIR__ . '/../src/repositories/GameRepository.php';
require_once __DIR__ . '/../src/repositories/BetRepository.php';
require_once __DIR__ . '/../src/repositories/TransactionRepository.php';
require_once __DIR__ . '/../src/services/AuthService.php';
require_once __DIR__ . '/../src/services/GameService.php';
require_once __DIR__ . '/../src/services/BetService.php';
require_once __DIR__ . '/../src/services/ApiFootballService.php';
require_once __DIR__ . '/../src/controllers/AuthController.php';
require_once __DIR__ . '/../src/controllers/GameController.php';
require_once __DIR__ . '/../src/controllers/BetController.php';
require_once __DIR__ . '/../src/controllers/UserController.php';
require_once __DIR__ . '/../src/controllers/RankingController.php';

$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

function route(string $path, string $httpMethod, callable $handler): void
{
    global $uri, $method;
    if ($uri === $path && $method === $httpMethod) {
        $handler();
        exit;
    }
}

function routeWithPattern(string $pattern, string $httpMethod, callable $handler): void
{
    global $uri, $method;
    if ($method !== $httpMethod) return;
    if (preg_match($pattern, $uri, $matches)) {
        $handler((int) $matches[1]);
        exit;
    }
}

function withDependencies(): array
{
    $db           = Database::connection();
    $users        = new UserRepository($db);
    $games        = new GameRepository($db);
    $bets         = new BetRepository($db);
    $transactions = new TransactionRepository($db);
    $config       = require __DIR__ . '/../src/config.php';
    return [$users, $games, $bets, $transactions, $config];
}

try {
    if (strpos($uri, '/api/') === 0) {

        if ($uri === '/api/csrf' && $method === 'GET') {
            session_start();
            jsonResponse(['token' => Csrf::token()]);
        }

        [$users, $games, $bets, $transactions, $config] = withDependencies();

        $authService    = new AuthService($users, $transactions);
        $gameService    = new GameService($games);
        $betService     = new BetService($bets, $games, $transactions, $config);

        $authController    = new AuthController($authService);
        $gameController    = new GameController($gameService, $games, $betService, $config);
        $betController     = new BetController($betService, $bets);
        $userController    = new UserController($users, $transactions);
        $rankingController = new RankingController($bets);

        // ── Auth ──────────────────────────────────────────────
        route('/api/register', 'POST', fn() => $authController->register());
        route('/api/login',    'POST', fn() => $authController->login());
        route('/api/logout',   'POST', fn() => $authController->logout());

        // ── Games ─────────────────────────────────────────────
        route('/api/jogos',          'GET',  fn() => $gameController->list());
        route('/api/admin/jogos',    'POST', fn() => $gameController->create());
        route('/api/admin/import',   'POST', fn() => $gameController->import());
        route('/api/admin/sync',     'POST', fn() => $gameController->sync());
        routeWithPattern('/^\/api\/admin\/jogos\/(\d+)\/resultado$/', 'POST',
            fn(int $id) => $gameController->result($id));

        // ── Bets ──────────────────────────────────────────────
        route('/api/apostas', 'GET',  fn() => $betController->list());
        route('/api/apostas', 'POST', fn() => $betController->create());
        routeWithPattern('/^\/api\/apostas\/(\d+)\/pagar$/',    'POST', fn(int $id) => $betController->pay($id));
        routeWithPattern('/^\/api\/apostas\/(\d+)\/confirmar$/', 'POST', fn(int $id) => $betController->confirm($id));

        // ── User & Ranking ────────────────────────────────────
        route('/api/user',    'GET', fn() => $userController->current());
        route('/api/ranking', 'GET', fn() => $rankingController->index());

        jsonResponse(['error' => 'Rota não encontrada'], 404);
    }

    echo file_get_contents(__DIR__ . '/../public/template.html');

} catch (Throwable $e) {
    Logger::error($e->getMessage(), ['trace' => $e->getTraceAsString()]);
    jsonResponse(['error' => $e->getMessage()], 500);
}
