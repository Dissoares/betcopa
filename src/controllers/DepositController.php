<?php
declare(strict_types=1);

class DepositController
{
    public function __construct(
        private readonly DepositRepository     $deposits,
        private readonly TransactionRepository $transactions,
        private readonly ConfigRepository      $config
    ) {}

    public function create(): void
    {
        Csrf::verify();
        $userId = ensureLogged();
        $body   = json_decode(file_get_contents('php://input'), true) ?: [];
        $valor  = round((float) ($body['valor'] ?? 0), 2);

        $min = (float) $this->config->get('stake_min', '5.00');
        if ($valor < $min) {
            jsonResponse(['error' => 'Valor mínimo: R$ ' . number_format($min, 2, ',', '.')], 400);
            return;
        }
        if ($valor > 10000) {
            jsonResponse(['error' => 'Valor máximo de depósito: R$ 10.000,00'], 400);
            return;
        }

        $depositId = $this->deposits->create($userId, $valor);
        $gateway   = PaymentGatewayFactory::create($this->config);
        $charge    = $gateway->createPixCharge(
            $valor,
            'Depósito BetCopa #' . $depositId,
            'deposit-' . $depositId . '-' . $userId
        );

        $this->deposits->updateGateway(
            $depositId,
            $gateway->getName(),
            $charge['payment_id'],
            $charge['qr_code'],
            $charge['qr_code_base64'],
            $charge['expires_at']
        );

        Logger::info('Depósito PIX criado', ['deposit_id' => $depositId, 'user_id' => $userId, 'valor' => $valor]);

        jsonResponse([
            'deposit_id'     => $depositId,
            'valor'          => $valor,
            'gateway'        => $gateway->getName(),
            'qr_code'        => $charge['qr_code'],
            'qr_code_base64' => $charge['qr_code_base64'],
            'expires_at'     => $charge['expires_at'],
        ]);
    }

    public function confirm(int $id): void
    {
        Csrf::verify();
        $userId  = ensureLogged();
        $deposit = $this->deposits->findById($id);

        if (!$deposit || (int) $deposit['user_id'] !== $userId) {
            jsonResponse(['error' => 'Depósito não encontrado'], 404);
            return;
        }
        if ($deposit['status'] === 'confirmado') {
            jsonResponse(['message' => 'Depósito já confirmado', 'status' => 'confirmado']);
            return;
        }
        if ($deposit['status'] !== 'pago') {
            jsonResponse(['error' => 'Pagamento ainda não processado pelo gateway'], 400);
            return;
        }

        $gateway = PaymentGatewayFactory::create($this->config);
        $status  = $gateway->getPaymentStatus($deposit['gateway_payment_id']);

        if (in_array($status, ['rejected', 'cancelled'], true)) {
            $this->deposits->updateStatus($id, $status);
            jsonResponse(['error' => 'Pagamento recusado ou cancelado'], 400);
            return;
        }
        if ($status === 'pending') {
            jsonResponse(['error' => 'Pagamento ainda não confirmado. Aguarde ou tente novamente.'], 400);
            return;
        }

        $this->deposits->updateStatus($id, 'confirmado');
        $this->transactions->create($userId, 'credito', (float) $deposit['valor'], 'Depósito via PIX #' . $id);
        Logger::info('Depósito confirmado', ['deposit_id' => $id, 'user_id' => $userId]);
        jsonResponse(['message' => 'Depósito confirmado! Saldo adicionado.', 'status' => 'confirmado']);
    }

    public function status(int $id): void
    {
        $userId  = ensureLogged();
        $deposit = $this->deposits->findById($id);
        if (!$deposit || (int) $deposit['user_id'] !== $userId) {
            jsonResponse(['error' => 'Não encontrado'], 404);
            return;
        }
        jsonResponse(['status' => $deposit['status']]);
    }
}
