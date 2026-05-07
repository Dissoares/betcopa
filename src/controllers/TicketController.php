<?php
declare(strict_types=1);

class TicketController
{
    public function __construct(
        private TicketRepository $tickets,
        private string           $adminEmail
    ) {}

    private function isAdmin(): bool
    {
        return !empty($_SESSION['user_email']) && $_SESSION['user_email'] === $this->adminEmail;
    }

    // GET /api/tickets — usuário: próprios tickets
    public function listMine(): void
    {
        $userId = ensureLogged();
        jsonResponse(['tickets' => $this->tickets->listByUser($userId)]);
    }

    // GET /api/admin/tickets — admin: todos os tickets
    public function listAll(): void
    {
        ensureAdmin($this->adminEmail);
        jsonResponse(['tickets' => $this->tickets->listAll()]);
    }

    // GET /api/tickets/{id} — ticket + mensagens (owner ou admin)
    public function show(int $id): void
    {
        $userId = ensureLogged();
        $ticket = $this->tickets->find($id);
        if (!$ticket) {
            jsonResponse(['error' => 'Ticket não encontrado.'], 404);
        }

        if (!$this->isAdmin() && (int) $ticket['user_id'] !== $userId) {
            jsonResponse(['error' => 'Acesso negado.'], 403);
        }

        $afterId  = isset($_GET['after']) ? (int) $_GET['after'] : 0;
        $messages = $this->tickets->messages($id, $afterId);
        jsonResponse(['ticket' => $ticket, 'messages' => $messages]);
    }

    // POST /api/tickets — criar ticket (usuário)
    public function create(): void
    {
        Csrf::verify();
        $userId = ensureLogged();
        $body   = json_decode(file_get_contents('php://input'), true) ?: [];

        $assunto  = trim($body['assunto']  ?? '');
        $mensagem = trim($body['mensagem'] ?? '');

        if (!$assunto || !$mensagem) {
            jsonResponse(['error' => 'Assunto e mensagem são obrigatórios.'], 422);
        }

        $ticketId = $this->tickets->create($userId, mb_substr($assunto, 0, 255), $mensagem);
        Logger::info('Ticket criado', ['ticket_id' => $ticketId, 'user_id' => $userId]);
        jsonResponse(['ticket_id' => $ticketId, 'message' => 'Ticket aberto com sucesso.'], 201);
    }

    // POST /api/tickets/{id}/messages — enviar mensagem (owner ou admin)
    public function sendMessage(int $id): void
    {
        Csrf::verify();
        $userId = ensureLogged();
        $ticket = $this->tickets->find($id);

        if (!$ticket) {
            jsonResponse(['error' => 'Ticket não encontrado.'], 404);
        }

        $isAdmin = $this->isAdmin();
        if (!$isAdmin && (int) $ticket['user_id'] !== $userId) {
            jsonResponse(['error' => 'Acesso negado.'], 403);
        }

        if ($ticket['status'] === 'fechado') {
            jsonResponse(['error' => 'Ticket fechado. Reabra-o para enviar mensagens.'], 422);
        }

        $body     = json_decode(file_get_contents('php://input'), true) ?: [];
        $mensagem = trim($body['mensagem'] ?? '');
        if (!$mensagem) {
            jsonResponse(['error' => 'Mensagem vazia.'], 422);
        }

        $tipo  = $isAdmin ? 'admin' : 'user';
        $msgId = $this->tickets->addMessage($id, $tipo, $userId, $mensagem);
        jsonResponse(['message_id' => $msgId]);
    }

    // POST /api/admin/tickets/{id}/status — alterar status (admin)
    public function updateStatus(int $id): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $body   = json_decode(file_get_contents('php://input'), true) ?: [];
        $status = $body['status'] ?? '';

        if (!in_array($status, ['aberto', 'em_atendimento', 'fechado'], true)) {
            jsonResponse(['error' => 'Status inválido.'], 422);
        }

        if (!$this->tickets->find($id)) {
            jsonResponse(['error' => 'Ticket não encontrado.'], 404);
        }

        $this->tickets->updateStatus($id, $status);
        Logger::info('Status de ticket atualizado', ['ticket_id' => $id, 'status' => $status]);
        jsonResponse(['message' => 'Status atualizado.']);
    }
}
