<?php
declare(strict_types=1);

class NotificationController
{
    public function __construct(private NotificationRepository $notifs) {}

    // GET /api/notifications
    public function list(): void
    {
        $userId = ensureLogged();
        jsonResponse([
            'notifications' => $this->notifs->listByUser($userId),
            'unread'        => $this->notifs->countUnread($userId),
        ]);
    }

    // POST /api/notifications/{id}/read
    public function markRead(int $id): void
    {
        $userId = ensureLogged();
        $this->notifs->markRead($id, $userId);
        jsonResponse(['ok' => true]);
    }

    // POST /api/notifications/read-all
    public function markAllRead(): void
    {
        $userId = ensureLogged();
        $this->notifs->markAllRead($userId);
        jsonResponse(['ok' => true]);
    }
}
