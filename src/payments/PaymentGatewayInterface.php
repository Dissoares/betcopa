<?php
declare(strict_types=1);

interface PaymentGatewayInterface
{
    /**
     * Cria uma cobrança PIX.
     *
     * @return array{payment_id:string, qr_code:string, qr_code_base64:string, expires_at:string}
     */
    public function createPixCharge(float $valor, string $descricao, string $externalId): array;

    /**
     * Consulta o status de um pagamento.
     *
     * @return string 'pending' | 'approved' | 'rejected' | 'cancelled'
     */
    public function getPaymentStatus(string $paymentId): string;

    /** Slug identificador do gateway ('mercadopago', 'simulado', ...) */
    public function getName(): string;
}
