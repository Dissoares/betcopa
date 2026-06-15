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
        private readonly PaymentRepository     $payments,
        private readonly BetRepository         $bets,
        private readonly TransactionRepository $transactions,
        private readonly ConfigRepository      $config,
        private readonly ?DepositRepository    $deposits = null
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
                Logger::info('Aposta confirmada via webhook MP', ['bet_id' => $bet['id']]);
            }
        } elseif (in_array($status, ['rejected', 'cancelled'], true)) {
            $this->payments->updateStatus((int) $payment['id'], $status);
        }

        // Verifica se é depósito (fallback: busca na tabela deposits por gateway_payment_id)
        if ($this->deposits !== null) {
            $deposit = $this->deposits->findByGatewayId($paymentId);
            if ($deposit && $deposit['status'] === 'pago' && $status === 'approved') {
                $this->deposits->updateStatus((int) $deposit['id'], 'confirmado');
                $this->transactions->create(
                    (int) $deposit['user_id'],
                    'credito',
                    (float) $deposit['valor'],
                    'Depósito via webhook #' . $deposit['id']
                );
                Logger::info('Depósito confirmado via webhook MP', ['deposit_id' => $deposit['id']]);
            }
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

    /**
     * Processa notificações da ExPay Brasil (dois passos).
     *
     * Passo 1 — ExPay envia POST à nossa notification_url:
     *   { date_notification, invoice_id, token }
     *
     * Passo 2 — Nós consultamos o status real em /en/request/status
     *   com { merchant_key, token }.
     *
     * Se status === 'approved', confirma a aposta.
     */
    public function expay(): void
    {
        $body = file_get_contents('php://input');
        $data = json_decode($body, true) ?? [];

        // Aceita também form-urlencoded
        if (empty($data)) {
            parse_str($body, $data);
        }

        $token     = (string) ($data['token']      ?? '');
        $invoiceId = (string) ($data['invoice_id'] ?? '');

        if ($token === '') {
            http_response_code(400);
            echo json_encode(['error' => 'token ausente']);
            return;
        }

        $merchantKey = $this->config->get('expay_merchant_key', '');
        if ($merchantKey === '') {
            http_response_code(500);
            echo json_encode(['error' => 'expay_merchant_key não configurada']);
            return;
        }

        // Passo 2: consulta status real usando o token
        $scheme  = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host    = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $notifUrl = "{$scheme}://{$host}/api/webhooks/expay";

        $gateway = new ExpayBrasilGateway($merchantKey, $notifUrl);
        $result  = $gateway->fetchStatusByToken($token);

        $status    = $result['status'];
        $invoiceId = $invoiceId ?: $result['invoice_id'];

        // Detecta formato do invoice_id: deposit-{id}-{userId} ou bet-{id}-{userId}
        if (preg_match('/^deposit-(\d+)-(\d+)$/', $invoiceId, $m)) {
            $depositId = (int) $m[1];
            if ($this->deposits !== null) {
                $deposit = $this->deposits->findById($depositId);
                if ($deposit && $deposit['status'] === 'pago' && $status === 'approved') {
                    $this->deposits->updateStatus($depositId, 'confirmado');
                    $this->transactions->create(
                        (int) $deposit['user_id'],
                        'credito',
                        (float) $deposit['valor'],
                        'Depósito via webhook ExPay #' . $depositId
                    );
                    Logger::info('Depósito confirmado via webhook ExPay', ['deposit_id' => $depositId]);
                }
            }
            http_response_code(200);
            echo json_encode(['ok' => true]);
            return;
        }

        if (!preg_match('/^bet-(\d+)-\d+$/', $invoiceId, $m)) {
            http_response_code(200);
            echo json_encode(['ok' => true, 'skip' => 'invoice_id_format']);
            return;
        }

        $betId   = (int) $m[1];
        $payment = $this->payments->findByBetId($betId);

        if (!$payment) {
            http_response_code(200);
            echo json_encode(['ok' => true, 'skip' => 'payment_not_found']);
            return;
        }

        if ($status === 'approved' && ($payment['status'] ?? '') !== 'approved') {
            $this->payments->updateStatus((int) $payment['id'], 'approved');

            $bet = $this->bets->find($betId);
            if ($bet && $bet['status'] === 'pago') {
                $this->bets->updateStatus($betId, 'confirmado');
                Logger::info('Aposta confirmada via webhook ExPay', ['bet_id' => $betId]);
            }
        } elseif ($status === 'rejected') {
            $this->payments->updateStatus((int) $payment['id'], 'rejected');
        }

        http_response_code(200);
        echo json_encode(['ok' => true]);
    }
}
