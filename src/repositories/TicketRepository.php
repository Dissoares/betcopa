<?php
declare(strict_types=1);

class TicketRepository
{
    public function __construct(private readonly PDO $db)
    {
        $this->createTablesIfNeeded();
    }

    private function createTablesIfNeeded(): void
    {
        $this->db->exec('CREATE TABLE IF NOT EXISTS tickets (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            user_id       INT         NOT NULL,
            assunto       VARCHAR(255) NOT NULL,
            status        ENUM("aberto","em_atendimento","fechado") NOT NULL DEFAULT "aberto",
            criado_em     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

        $this->db->exec('CREATE TABLE IF NOT EXISTS ticket_messages (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            ticket_id       INT  NOT NULL,
            remetente_tipo  ENUM("user","admin") NOT NULL,
            remetente_id    INT  NOT NULL,
            mensagem        TEXT NOT NULL,
            criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    }

    public function create(int $userId, string $assunto, string $mensagem): int
    {
        $this->db->beginTransaction();
        try {
            $this->db->prepare(
                'INSERT INTO tickets (user_id, assunto) VALUES (:uid, :assunto)'
            )->execute(['uid' => $userId, 'assunto' => $assunto]);

            $ticketId = (int) $this->db->lastInsertId();

            $this->db->prepare(
                'INSERT INTO ticket_messages (ticket_id, remetente_tipo, remetente_id, mensagem)
                 VALUES (:tid, "user", :uid, :msg)'
            )->execute(['tid' => $ticketId, 'uid' => $userId, 'msg' => $mensagem]);

            $this->db->commit();
            return $ticketId;
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function listByUser(int $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT t.*,
                    (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) AS total_msgs,
                    (SELECT mensagem FROM ticket_messages WHERE ticket_id = t.id ORDER BY id DESC LIMIT 1) AS ultima_mensagem
             FROM tickets t
             WHERE t.user_id = :uid
             ORDER BY t.atualizado_em DESC'
        );
        $stmt->execute(['uid' => $userId]);
        return $stmt->fetchAll();
    }

    public function listAll(): array
    {
        $stmt = $this->db->prepare(
            'SELECT t.*, u.nome AS user_nome, u.email AS user_email,
                    (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) AS total_msgs,
                    (SELECT mensagem FROM ticket_messages WHERE ticket_id = t.id ORDER BY id DESC LIMIT 1) AS ultima_mensagem
             FROM tickets t
             JOIN users u ON u.id = t.user_id
             ORDER BY t.atualizado_em DESC'
        );
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT t.*, u.nome AS user_nome, u.email AS user_email
             FROM tickets t
             JOIN users u ON u.id = t.user_id
             WHERE t.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }

    public function messages(int $ticketId, int $afterId = 0): array
    {
        if ($afterId > 0) {
            $stmt = $this->db->prepare(
                'SELECT m.*, u.nome AS user_nome
                 FROM ticket_messages m
                 LEFT JOIN users u ON u.id = m.remetente_id AND m.remetente_tipo = "user"
                 WHERE m.ticket_id = :tid AND m.id > :aid
                 ORDER BY m.criado_em ASC'
            );
            $stmt->execute(['tid' => $ticketId, 'aid' => $afterId]);
        } else {
            $stmt = $this->db->prepare(
                'SELECT m.*, u.nome AS user_nome
                 FROM ticket_messages m
                 LEFT JOIN users u ON u.id = m.remetente_id AND m.remetente_tipo = "user"
                 WHERE m.ticket_id = :tid
                 ORDER BY m.criado_em ASC'
            );
            $stmt->execute(['tid' => $ticketId]);
        }
        return $stmt->fetchAll();
    }

    public function addMessage(int $ticketId, string $tipo, int $remetenteId, string $mensagem): int
    {
        $this->db->prepare(
            'INSERT INTO ticket_messages (ticket_id, remetente_tipo, remetente_id, mensagem)
             VALUES (:tid, :tipo, :rid, :msg)'
        )->execute(['tid' => $ticketId, 'tipo' => $tipo, 'rid' => $remetenteId, 'msg' => $mensagem]);

        $msgId = (int) $this->db->lastInsertId();

        // Update ticket timestamp and auto-promote status
        $this->db->prepare(
            'UPDATE tickets
             SET atualizado_em = NOW(),
                 status = CASE
                   WHEN status = "fechado" THEN "aberto"
                   WHEN :tipo = "admin" AND status = "aberto" THEN "em_atendimento"
                   ELSE status
                 END
             WHERE id = :tid'
        )->execute(['tipo' => $tipo, 'tid' => $ticketId]);

        return $msgId;
    }

    public function updateStatus(int $id, string $status): void
    {
        $this->db->prepare(
            'UPDATE tickets SET status = :status, atualizado_em = NOW() WHERE id = :id'
        )->execute(['status' => $status, 'id' => $id]);
    }

    public function userOwns(int $ticketId, int $userId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM tickets WHERE id = :tid AND user_id = :uid LIMIT 1'
        );
        $stmt->execute(['tid' => $ticketId, 'uid' => $userId]);
        return (bool) $stmt->fetch();
    }

    public function countOpen(): int
    {
        return (int) $this->db->query(
            'SELECT COUNT(*) FROM tickets WHERE status != "fechado"'
        )->fetchColumn();
    }
}
