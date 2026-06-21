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

    /** GET /api/chat/guest — público, busca mensagens do visitante */
    public function guestMessages(): void
    {
        $guestId = trim((string) ($_GET['guest_id'] ?? ''));
        $afterId = (int) ($_GET['after'] ?? 0);

        if (!$guestId || strlen($guestId) > 64) {
            jsonResponse(['messages' => []]);
            return;
        }

        $messages = $afterId > 0
            ? $this->chat->guestAfterIdFromServer($guestId, $afterId)
            : $this->chat->getGuestConversation($guestId);

        jsonResponse(['messages' => $messages]);
    }

    /** POST /api/chat/guest — público, sem autenticação */
    public function guestSend(): void
    {
        $body    = json_decode(file_get_contents('php://input'), true) ?: [];
        $guestId = trim((string) ($body['guest_id'] ?? ''));
        $msg     = trim((string) ($body['message']  ?? ''));

        if (!$guestId || !$msg || mb_strlen($guestId) > 64 || mb_strlen($msg) > 1000) {
            jsonResponse(['error' => 'Dados inválidos'], 422);
        }

        $id = $this->chat->sendGuest($guestId, $msg);
        jsonResponse(['id' => $id, 'ok' => true]);
    }

    /** POST /api/chat/claim — vincula guest_id ao user logado */
    public function claimGuest(): void
    {
        $userId  = ensureLogged();
        $body    = json_decode(file_get_contents('php://input'), true) ?: [];
        $guestId = trim((string) ($body['guest_id'] ?? ''));

        if (!$guestId) {
            jsonResponse(['ok' => true]);
            return;
        }

        $this->chat->claimGuest($guestId, $userId);
        jsonResponse(['ok' => true]);
    }

    /** GET /api/admin/chat/conversations */
    public function adminConversations(): void
    {
        ensureAdmin($this->adminEmail);
        jsonResponse(['conversations' => $this->chat->getConversations()]);
    }

    /** GET /api/admin/chat/conversation?user_id=X ou ?guest_id=X */
    public function adminConversation(): void
    {
        ensureAdmin($this->adminEmail);

        $guestId = trim((string) ($_GET['guest_id'] ?? ''));
        if ($guestId) {
            $messages = $this->chat->getGuestConversation($guestId);
            $this->chat->markGuestReadByAdmin($guestId);
            jsonResponse(['messages' => $messages, 'conv_type' => 'guest', 'conv_key' => $guestId]);
            return;
        }

        $userId = (int) ($_GET['user_id'] ?? 0);
        if (!$userId) jsonResponse(['error' => 'user_id ou guest_id obrigatório'], 422);

        $messages = $this->chat->getConversation($userId);
        $this->chat->markReadByAdmin($userId);
        jsonResponse(['messages' => $messages, 'conv_type' => 'user', 'conv_key' => $userId]);
    }

    /** POST /api/admin/chat/reply */
    public function adminReply(): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);
        $body    = json_decode(file_get_contents('php://input'), true) ?: [];
        $userId  = (int) ($body['user_id']  ?? 0);
        $guestId = trim((string) ($body['guest_id'] ?? ''));
        $msg     = trim((string) ($body['message']  ?? ''));

        if (!$msg) jsonResponse(['error' => 'Mensagem vazia'], 422);

        if ($guestId) {
            $id = $this->chat->sendGuestAdmin($guestId, $msg);
        } elseif ($userId) {
            $id = $this->chat->send($userId, 'admin', $msg);
        } else {
            jsonResponse(['error' => 'Destinatário inválido'], 422);
        }

        jsonResponse(['id' => $id, 'ok' => true]);
    }

    /** GET /api/admin/chat/unread */
    public function adminUnread(): void
    {
        ensureAdmin($this->adminEmail);
        jsonResponse(['count' => $this->chat->countAdminUnread()]);
    }
}
