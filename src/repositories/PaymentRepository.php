<?php
declare(strict_types=1);

class PaymentRepository
{
    public function __construct(private readonly PDO $db) {}

    public function create(
        int    $apostaId,
        string $gateway,
        string $gatewayPaymentId,
        string $qrCode,
        string $qrCodeBase64,
        float  $valor,
        string $expiresAt
    ): int {
        $stmt = $this->db->prepare(
            'INSERT INTO pagamentos
             (aposta_id, gateway, gateway_payment_id, qr_code, qr_code_base64, valor, status, expires_at)
             VALUES (:aposta_id, :gateway, :gpid, :qr, :qrb64, :valor, :status, :expires_at)'
        );
        $stmt->execute([
            'aposta_id' => $apostaId,
            'gateway'   => $gateway,
            'gpid'      => $gatewayPaymentId,
            'qr'        => $qrCode,
            'qrb64'     => $qrCodeBase64,
            'valor'     => $valor,
            'status'    => 'pending',
            'expires_at' => $expiresAt,
        ]);
        return (int) $this->db->lastInsertId();
    }

    public function findByBetId(int $apostaId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM pagamentos WHERE aposta_id = :id ORDER BY criado_em DESC LIMIT 1'
        );
        $stmt->execute(['id' => $apostaId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function findByGatewayId(string $gatewayPaymentId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM pagamentos WHERE gateway_payment_id = :gid LIMIT 1'
        );
        $stmt->execute(['gid' => $gatewayPaymentId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function updateStatus(int $id, string $status): void
    {
        $stmt = $this->db->prepare(
            'UPDATE pagamentos SET status = :status, atualizado_em = NOW() WHERE id = :id'
        );
        $stmt->execute(['status' => $status, 'id' => $id]);
    }
}
