<?php
class Csrf
{
    public static function token(): string
    {
        session_start();
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(24));
        }
        return $_SESSION['csrf_token'];
    }

    public static function verify(): void
    {
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null;
        if (empty($token)) {
            $body = json_decode(file_get_contents('php://input'), true);
            $token = $body['csrf'] ?? $body['csrf_token'] ?? null;
        }
        session_start();
        if (empty($token) || empty($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $token)) {
            jsonResponse(['error' => 'Token CSRF inválido'], 403);
        }
    }
}
