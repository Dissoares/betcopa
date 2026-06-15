<?php
declare(strict_types=1);

class DepositRepository
{
    public function __construct(private readonly PDO $db) {}

    public function create(int $userId, float $valor): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO deposits (user_id, valor) VALUES (:user_id, :valor)'
        );
        $stmt->execute(['user_id' => $userId, 'valor' => $valor]);
        return (int) $this->db->lastInsertId();
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM deposits WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function findByGatewayId(string $gatewayPaymentId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM deposits WHERE gateway_payment_id = :gid LIMIT 1'
        );
        $stmt->execute(['gid' => $gatewayPaymentId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function updateGateway(
        int    $id,
        string $gateway,
        string $gatewayPaymentId,
        string $qrCode,
        string $qrCodeBase64,
        string $expiresAt
    ): void {
        $stmt = $this->db->prepare(
            'UPDATE deposits
             SET status = "pago", gateway = :gw, gateway_payment_id = :gpid,
                 qr_code = :qr, qr_code_base64 = :qrb64, expires_at = :exp
             WHERE id = :id'
        );
        $stmt->execute([
            'gw'    => $gateway,
            'gpid'  => $gatewayPaymentId,
            'qr'    => $qrCode    ?: null,
            'qrb64' => $qrCodeBase64 ?: null,
            'exp'   => $expiresAt ?: null,
            'id'    => $id,
        ]);
    }

    public function updateStatus(int $id, string $status): void
    {
        $stmt = $this->db->prepare(
            'UPDATE deposits SET status = :status, atualizado_em = NOW() WHERE id = :id'
        );
        $stmt->execute(['status' => $status, 'id' => $id]);
    }
}
