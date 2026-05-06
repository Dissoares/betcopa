<?php
declare(strict_types=1);

/**
 * Gateway simulado — sem chamadas externas.
 * Usado em desenvolvimento ou quando nenhum gateway real está configurado.
 */
class SimulatedGateway implements PaymentGatewayInterface
{
    public function createPixCharge(float $valor, string $descricao, string $externalId): array
    {
        return [
            'payment_id'     => 'sim_' . $externalId . '_' . time(),
            'qr_code'        => '',
            'qr_code_base64' => '',
            'expires_at'     => date('Y-m-d H:i:s', strtotime('+10 minutes')),
        ];
    }

    public function getPaymentStatus(string $paymentId): string
    {
        return 'approved';
    }

    public function getName(): string
    {
        return 'simulado';
    }
}
