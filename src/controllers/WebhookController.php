<?php
declare(strict_types=1);

/**
 * Processa webhooks do Mercado Pago.
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 * MP exige resposta 200 em < 5s.
 */
class WebhookController
{
    public function __construct(
        private readonly PaymentRepository $payments,
        private readonly BetRepository     $bets,
        private readonly TransactionRepository $transactions,
        private readonly ConfigRepository  $config
    ) {}

    public function mercadopago(): void
    {
        $secret = $this->config->get('mp_webhook_secret', '');
        $body   = file_get_contents('php://input');
        $data   = json_decode($body, true) ?? [];

        // Valida assinatura HMAC-SHA256 quando configurada
        if ($secret !== '') {
            $signature = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
            [$ts, $hash] = $this->parseSignature($signature);
            $requestId   = $_SERVER['HTTP_X_REQUEST_ID'] ?? '';
            $dataId      = (string) ($data['data']['id'] ?? '');
            $manifest    = "id:{$dataId};request-id:{$requestId};ts:{$ts};";
            $expected    = hash_hmac('sha256', $manifest, $secret);

            if (!hash_equals($expected, $hash)) {
                http_response_code(401);
                echo json_encode(['error' => 'Assinatura inválida']);
                return;
            }
        }

        $type      = $data['type'] ?? '';
        $paymentId = (string) ($data['data']['id'] ?? '');

        if ($type !== 'payment' || $paymentId === '') {
            http_response_code(200);
            echo json_encode(['ok' => true]);
            return;
        }

        $payment = $this->payments->findByGatewayId($paymentId);
        if (!$payment) {
            http_response_code(200);
            echo json_encode(['ok' => true, 'skip' => 'not_found']);
            return;
        }

        // Consulta status real no MP
        $gateway = new MercadoPagoGateway($this->config->get('mp_access_token', ''));
        $status  = $gateway->getPaymentStatus($paymentId);

        if ($status === 'approved' && $payment['status'] !== 'approved') {
            $this->payments->updateStatus((int) $payment['id'], 'approved');

            $bet = $this->bets->find((int) $payment['aposta_id']);
            if ($bet && $bet['status'] === 'pago') {
                $this->bets->updateStatus((int) $bet['id'], 'confirmado');
                $this->transactions->create(
                    (int) $bet['user_id'],
                    'debito',
                    (float) $bet['valor'],
                    'Aposta confirmada via webhook #' . $bet['id']
                );
                Logger::info('Aposta confirmada via webhook MP', ['bet_id' => $bet['id']]);
            }
        } elseif (in_array($status, ['rejected', 'cancelled'], true)) {
            $this->payments->updateStatus((int) $payment['id'], $status);
        }

        http_response_code(200);
        echo json_encode(['ok' => true]);
    }

    private function parseSignature(string $signature): array
    {
        $ts = $hash = '';
        foreach (explode(',', $signature) as $part) {
            [$k, $v] = array_pad(explode('=', $part, 2), 2, '');
            if (trim($k) === 'ts') $ts   = trim($v);
            if (trim($k) === 'v1') $hash = trim($v);
        }
        return [$ts, $hash];
    }
}
