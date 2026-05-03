<?php
class AuthController
{
    private AuthService $service;

    public function __construct(AuthService $service)
    {
        $this->service = $service;
    }

    public function register(): void
    {
        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        if (!empty($_SERVER['HTTP_X_CSRF_TOKEN']) || !empty($body['csrf']) || !empty($body['csrf_token'])) {
            Csrf::verify();
        }
        $nome = trim($body['nome'] ?? '');
        $email = trim($body['email'] ?? '');
        $senha = trim($body['senha'] ?? '');
        $user = $this->service->register($nome, $email, $senha);
        jsonResponse(['user' => $user]);
    }

    public function login(): void
    {
        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        if (!empty($_SERVER['HTTP_X_CSRF_TOKEN']) || !empty($body['csrf']) || !empty($body['csrf_token'])) {
            Csrf::verify();
        }
        $email = trim($body['email'] ?? '');
        $senha = trim($body['senha'] ?? '');
        $user = $this->service->login($email, $senha);
        jsonResponse(['user' => ['id' => $user['id'], 'nome' => $user['nome'], 'email' => $user['email']]]);
    }

    public function logout(): void
    {
        Csrf::verify();
        session_start();
        session_unset();
        session_destroy();
        jsonResponse(['message' => 'Logout concluído']);
    }
}
