<?php
declare(strict_types=1);

/**
 * Gateway Mercado Pago — PIX dinâmico.
 * Docs: https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post
 */
class MercadoPagoGateway implements PaymentGatewayInterface
{
    private const API_BASE = 'https://api.mercadopago.com';

    public function __construct(private readonly string $accessToken) {}

    public function createPixCharge(float $valor, string $descricao, string $externalId): array
    {
        $host    = ($_SERVER['REQUEST_SCHEME'] ?? 'https') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
        $payload = [
            'transaction_amount' => $valor,
            'description'        => $descricao,
            'payment_method_id'  => 'pix',
            'external_reference' => $externalId,
            'notification_url'   => $host . '/api/webhooks/mercadopago',
            'payer'              => ['email' => 'pagador@betcopa.com'],
        ];

        $response = $this->request('POST', '/v1/payments', $payload, $externalId);
        $txData   = $response['point_of_interaction']['transaction_data'] ?? [];

        return [
            'payment_id'     => (string) ($response['id'] ?? ''),
            'qr_code'        => $txData['qr_code']        ?? '',
            'qr_code_base64' => $txData['qr_code_base64'] ?? '',
            'expires_at'     => date('Y-m-d H:i:s', strtotime('+10 minutes')),
        ];
    }

    public function getPaymentStatus(string $paymentId): string
    {
        $response = $this->request('GET', "/v1/payments/{$paymentId}");

        return match ($response['status'] ?? '') {
            'approved'                           => 'approved',
            'rejected', 'refunded', 'charged_back' => 'rejected',
            'cancelled'                          => 'cancelled',
            default                              => 'pending',
        };
    }

    public function getName(): string
    {
        return 'mercadopago';
    }

    private function request(string $method, string $path, array $body = [], string $idempotencyKey = ''): array
    {
        $headers = [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->accessToken,
        ];
        if ($idempotencyKey !== '') {
            $headers[] = 'X-Idempotency-Key: ' . $idempotencyKey;
        }

        $ch = curl_init(self::API_BASE . $path);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_CUSTOMREQUEST  => $method,
        ]);
        if ($method === 'POST' && !empty($body)) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        $raw  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($err) {
            throw new RuntimeException('Mercado Pago: erro de conexão — ' . $err);
        }

        $data = json_decode($raw, true) ?? [];

        if ($code >= 400) {
            $msg = $data['message'] ?? $data['error'] ?? 'Erro desconhecido';
            throw new RuntimeException("Mercado Pago ({$code}): {$msg}");
        }

        return $data;
    }
}
