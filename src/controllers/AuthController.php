<?php
class AuthController
{
    private AuthService $service;
    private ?PasswordResetRepository $resets = null;
    private ?Mailer $mailer = null;

    public function __construct(AuthService $service)
    {
        $this->service = $service;
    }

    public function setPasswordReset(PasswordResetRepository $repo, Mailer $mailer): void
    {
        $this->resets = $repo;
        $this->mailer = $mailer;
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

    public function forgotPassword(): void
    {
        $body  = json_decode(file_get_contents('php://input'), true) ?: [];
        $email = trim($body['email'] ?? '');

        if (!$email) {
            jsonResponse(['error' => 'E-mail obrigatório'], 422);
        }

        $baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                 . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');

        $token = $this->service->forgotPassword($email, $this->resets, $this->mailer, $baseUrl);

        // Sempre responde com sucesso (não revela se e-mail existe)
        $response = ['message' => 'Se o e-mail estiver cadastrado, você receberá as instruções em breve.'];

        // Em dev (mail desabilitado), retorna o link diretamente para facilitar testes
        if ($token) {
            $response['reset_url'] = $baseUrl . '/?reset=' . $token;
        }

        jsonResponse($response);
    }

    public function resetPassword(): void
    {
        $body     = json_decode(file_get_contents('php://input'), true) ?: [];
        $token    = trim($body['token']     ?? '');
        $novaSenha = trim($body['nova_senha'] ?? '');

        if (!$token || !$novaSenha) {
            jsonResponse(['error' => 'Dados incompletos'], 422);
        }

        $this->service->resetPassword($token, $novaSenha, $this->resets);
        jsonResponse(['message' => 'Senha redefinida com sucesso! Faça login.']);
    }
}
