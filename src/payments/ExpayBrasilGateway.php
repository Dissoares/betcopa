<?php
declare(strict_types=1);

/**
 * Gateway ExPay Brasil — PIX dinâmico.
 * Docs: https://expaybrasil.readme.io/reference/emiss%C3%A3o-de-pix-expay-brasil
 *
 * Fluxo de status:
 *  - createPixCharge() → cria cobrança, retorna QR code
 *  - getPaymentStatus() → retorna 'pending' (status vem via webhook)
 *  - fetchStatusByToken() → chamado pelo WebhookController após receber notificação
 */
class ExpayBrasilGateway implements PaymentGatewayInterface
{
    private const ENDPOINT_CHARGE = 'https://expaybrasil.com/en/purchase/link';
    private const ENDPOINT_STATUS = 'https://expaybrasil.com/en/request/status';

    public function __construct(
        private readonly string $merchantKey,
        private readonly string $notificationUrl
    ) {}

    public function createPixCharge(float $valor, string $descricao, string $externalId): array
    {
        $invoice = [
            'invoice_id'          => $externalId,
            'invoice_description' => $descricao,
            'total'               => number_format($valor, 2, '.', ''),
            'devedor'             => 'BetCopa',
            'email'               => 'pagamentos@betcopa.com',
            'cpf_cnpj'            => '00000000000',
            'notification_url'    => $this->notificationUrl,
            'telefone'            => '00000000000',
            'items'               => [[
                'name'        => $descricao,
                'price'       => number_format($valor, 2, '.', ''),
                'description' => $descricao,
                'qty'         => '1',
            ]],
        ];

        $postFields = http_build_query([
            'merchant_key'  => $this->merchantKey,
            'currency_code' => 'BRL',
            'invoice'       => json_encode($invoice),
        ]);

        $ch = curl_init(self::ENDPOINT_CHARGE);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => [
                'Accept: application/json',
                'Content-Type: application/x-www-form-urlencoded',
            ],
            CURLOPT_POSTFIELDS     => $postFields,
        ]);

        $body  = curl_exec($ch);
        $errno = curl_errno($ch);
        curl_close($ch);

        if ($errno || $body === false) {
            throw new RuntimeException('ExPay Brasil: erro de conexão (' . $errno . ')');
        }

        $data = json_decode($body, true);
        $pix  = $data['pix_request'] ?? null;

        if (!$pix || !($pix['result'] ?? false)) {
            $msg = $pix['response_message'] ?? ($data['message'] ?? $body);
            throw new RuntimeException('ExPay Brasil: ' . $msg);
        }

        $pixCode   = $pix['pix_code'] ?? [];
        $expiresAt = isset($pix['expire_date'])
            ? (new DateTime($pix['expire_date']))->format('c')
            : (new DateTime('+1 day'))->format('c');

        return [
            'payment_id'     => (string) ($pix['transaction_id'] ?? ''),
            'qr_code'        => $pixCode['emv'] ?? '',
            'qr_code_base64' => $pixCode['qrcode_base64'] ?? '',
            'expires_at'     => $expiresAt,
        ];
    }

    /**
     * ExPay não fornece endpoint de consulta por transaction_id sem token.
     * O status é atualizado automaticamente pelo webhook.
     * Retorna 'pending'; BetService verifica o status local antes de chamar isso.
     */
    public function getPaymentStatus(string $paymentId): string
    {
        return 'pending';
    }

    /**
     * Consulta o status completo usando o token recebido no webhook (Passo 2).
     * Deve ser chamado pelo WebhookController após receber a notificação inicial.
     *
     * @return array{status:string, invoice_id:string}
     */
    public function fetchStatusByToken(string $token): array
    {
        $ch = curl_init(self::ENDPOINT_STATUS);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
            CURLOPT_POSTFIELDS     => http_build_query([
                'merchant_key' => $this->merchantKey,
                'token'        => $token,
            ]),
        ]);

        $body  = curl_exec($ch);
        $errno = curl_errno($ch);
        curl_close($ch);

        if ($errno || $body === false) {
            return ['status' => 'pending', 'invoice_id' => ''];
        }

        $data = json_decode($body, true) ?? [];
        $tx   = $data['transaction_request'] ?? $data;

        $rawStatus = strtolower((string) ($tx['status'] ?? 'pending'));
        $invoiceId = (string) ($tx['invoice_id'] ?? '');

        $normalized = match (true) {
            in_array($rawStatus, ['paid', 'approved', 'completed'], true)                => 'approved',
            in_array($rawStatus, ['canceled', 'cancelled', 'refunded', 'chargeback'], true) => 'rejected',
            default                                                                       => 'pending',
        };

        return ['status' => $normalized, 'invoice_id' => $invoiceId];
    }

    public function getMerchantKey(): string
    {
        return $this->merchantKey;
    }

    public function getName(): string
    {
        return 'expay';
    }
}
