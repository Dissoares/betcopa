<?php
declare(strict_types=1);

class WithdrawalController
{
    private const VALOR_MINIMO = 10.00;

    private ?Mailer $mailer = null;

    public function __construct(
        private readonly WithdrawalRepository  $withdrawals,
        private readonly TransactionRepository $transactions,
        private readonly ConfigRepository      $config,
        private readonly string                $adminEmail
    ) {}

    public function setMailer(Mailer $mailer): void { $this->mailer = $mailer; }

    /** POST /api/user/saques */
    public function request(): void
    {
        Csrf::verify();
        $userId = ensureLogged();

        if ($this->config->get('saques_ativos', '1') !== '1') {
            jsonResponse(['error' => 'Saques temporariamente indisponíveis'], 503);
        }

        $body  = json_decode(file_get_contents('php://input'), true) ?? [];
        $valor = round((float) ($body['valor']     ?? 0), 2);
        $chave = trim((string) ($body['chave_pix'] ?? ''));
        $tipo  = trim((string) ($body['tipo_pix']  ?? ''));

        if (!in_array($tipo, ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'], true)) {
            jsonResponse(['error' => 'Tipo de chave PIX inválido'], 422);
        }
        if ($valor < self::VALOR_MINIMO) {
            jsonResponse(['error' => 'Valor mínimo de saque: R$ 10,00'], 422);
        }
        if ($chave === '') {
            jsonResponse(['error' => 'Chave PIX é obrigatória'], 422);
        }

        $saldo = $this->transactions->balance($userId);
        if ($saldo < $valor) {
            jsonResponse(['error' => 'Saldo insuficiente'], 422);
        }

        // Debita imediatamente; admin processa o pagamento externo
        $this->transactions->create($userId, 'debito', $valor, 'Solicitação de saque #aguardando');
        $id = $this->withdrawals->create($userId, $valor, $chave, $tipo);

        // Atualiza descrição da transação com ID do saque
        Logger::info('Saque solicitado', ['user_id' => $userId, 'saque_id' => $id, 'valor' => $valor]);
        jsonResponse(['message' => 'Saque solicitado! Prazo: até 48h úteis.', 'id' => $id], 201);
    }

    /** GET /api/user/saques */
    public function list(): void
    {
        $userId = ensureLogged();
        jsonResponse(['saques' => $this->withdrawals->listByUser($userId)]);
    }

    /** POST /api/admin/saques/:id/aprovar */
    public function approve(int $id): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $saque = $this->withdrawals->find($id);
        if (!$saque) jsonResponse(['error' => 'Saque não encontrado'], 404);
        if ($saque['status'] !== 'pendente') jsonResponse(['error' => 'Saque já processado'], 422);

        $this->withdrawals->updateStatus($id, 'aprovado');
        Logger::info('Saque aprovado pelo admin', ['id' => $id]);

        if ($this->mailer && !empty($saque['user_email'])) {
            try { $this->mailer->withdrawalApproved($saque['user_email'], $saque['user_nome'], (float) $saque['valor']); }
            catch (\Throwable $e) { Logger::info('Mail falhou (withdrawalApproved)', ['err' => $e->getMessage()]); }
        }

        jsonResponse(['message' => 'Saque aprovado.']);
    }

    /** POST /api/admin/saques/:id/rejeitar */
    public function reject(int $id): void
    {
        Csrf::verify();
        ensureAdmin($this->adminEmail);

        $body  = json_decode(file_get_contents('php://input'), true) ?? [];
        $obs   = trim((string) ($body['obs'] ?? ''));

        $saque = $this->withdrawals->find($id);
        if (!$saque) jsonResponse(['error' => 'Saque não encontrado'], 404);
        if ($saque['status'] !== 'pendente') jsonResponse(['error' => 'Saque já processado'], 422);

        // Estorna o saldo ao usuário
        $this->transactions->create(
            (int) $saque['user_id'],
            'credito',
            (float) $saque['valor'],
            'Estorno de saque rejeitado #' . $id
        );
        $this->withdrawals->updateStatus($id, 'rejeitado', $obs);
        Logger::info('Saque rejeitado', ['id' => $id, 'obs' => $obs]);

        if ($this->mailer && !empty($saque['user_email'])) {
            try { $this->mailer->withdrawalRejected($saque['user_email'], $saque['user_nome'], (float) $saque['valor'], $obs); }
            catch (\Throwable $e) { Logger::info('Mail falhou (withdrawalRejected)', ['err' => $e->getMessage()]); }
        }

        jsonResponse(['message' => 'Saque rejeitado e saldo estornado.']);
    }
}
