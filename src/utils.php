<?php
function input(string $key, $default = null)
{
    $data = ['GET' => $_GET, 'POST' => $_POST];
    $value = $data[$_SERVER['REQUEST_METHOD']][$key] ?? null;
    if ($value === null && in_array($_SERVER['REQUEST_METHOD'], ['POST','PUT','PATCH','DELETE'])) {
        $body = json_decode(file_get_contents('php://input'), true);
        $value = $body[$key] ?? null;
    }
    return $value ?? $default;
}

function jsonResponse($data, int $status = 200): void
{
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function ensureLogged(): int
{
    session_start();
    if (empty($_SESSION['user_id'])) {
        jsonResponse(['error' => 'Acesso não autorizado'], 401);
    }
    return (int) $_SESSION['user_id'];
}

function validateEmail(string $email): bool
{
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

function maskUserName(string $name): string
{
    $first = mb_substr($name, 0, 1);
    return $first . str_repeat('*', max(2, mb_strlen($name) - 1));
}
