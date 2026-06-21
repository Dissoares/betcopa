<?php
declare(strict_types=1);

class ChatController
{
    public function __construct(
        private readonly ChatRepository $chat,
        private readonly string         $adminEmail
    ) {}

    /** GET /api/chat/messages */
    public function getMessages(): void
    {
        $userId  = ensureLogged();
        $afterId = (int) ($_GET['after'] ?? 0);

        $messages = $afterId > 0
            ? $this->chat->afterId($userId, $afterId)
            : $this->chat->getForUser($userId);

        $this->chat->markReadByUser($userId);
        jsonResponse(['messages' => $messages]);
    }

    /** POST /api/chat/messages */
    public function sendMessage(): void
    {
        Csrf::verify();
        $userId = ensureLogged();
        $body   = json_decode(file_get_contents('php://input'), true) ?: [];
        $msg    = trim((string) ($body['message'] ?? ''));

        if (!$msg || mb_strlen($msg) > 1000) {
            jsonResponse(['error' => 'Mensagem inválida'], 422);
        }

        $id = $this->chat->send($userId, 'user', $msg);
        jsonResponse(['id' => $id, 'ok' => true]);
    }

    /** GET /api/chat/unread */
    public function getUnread(): void
    {
        $userId = ensureLogged();
        jsonResponse(['count' => $this->chat->getUnreadCount($userId)]);
    }

    /** GET /api/admin/chat/conversations */
    public function adminConversations(): void
    {
        ensureAdmin($this->adminEmail);
        jsonResponse(['conversations' => $this->chat->getConversations()]);
    }

    /** GET /api/admin/chat/conversation?user_id=X */
    public function adminConversation(): void
    {
        ensureAdmin($this->adminEmail);
        $userId = (int) ($_GET['user_id'] ?? 0);
        if (!$userId) jsonResponse(['error' => 'user_id obrigatório'], 422);

        $messages = $this->chat->getConversation($userId);
        $this->chat->markReadByAdmin($userId);
        jsonResponse(['messages' => $messages]);
    }

    /** POST /api/admin/chat/reply */
    public function adminReply(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);
        $body   = json_decode(file_get_contents('php://input'), true) ?: [];
        $userId = (int) ($body['user_id'] ?? 0);
        $msg    = trim((string) ($body['message'] ?? ''));

        if (!$userId || !$msg) jsonResponse(['error' => 'Dados inválidos'], 422);

        $id = $this->chat->send($userId, 'admin', $msg);
        jsonResponse(['id' => $id, 'ok' => true]);
    }

    /** GET /api/admin/chat/unread */
    public function adminUnread(): void
    {
        ensureAdmin($this->adminEmail);
        jsonResponse(['count' => $this->chat->countAdminUnread()]);
    }
}
