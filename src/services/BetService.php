<?php
class BetService
{
    private BetRepository $bets;
    private GameRepository $games;
    private TransactionRepository $transactions;
    private array $config;
    private ConfigRepository $configRepo;
    private ?PaymentRepository $paymentsRepo = null;

    public function __construct(BetRepository $bets, GameRepository $games, TransactionRepository $transactions, array $config, ConfigRepository $configRepo)
    {
        $this->bets         = $bets;
        $this->games        = $games;
        $this->transactions = $transactions;
        $this->config       = $config;
        $this->configRepo   = $configRepo;
    }

    public function setPaymentRepository(PaymentRepository $repo): void
    {
        $this->paymentsRepo = $repo;
    }

    /**
     * Cria uma aposta.
     * possivel_ganho = valor_base × multiplicador
     * valor_pago     = possivel_ganho × 10%  (aposta é sempre 10% do prêmio)
     */
    public function createBet(int $userId, int $jogoId, int $placarCasa, int $placarFora, int $multiplicador): array
    {
        $game = $this->games->find($jogoId);
        if (!$game) {
            throw new InvalidArgumentException('Jogo inválido');
        }

        if ($game['status'] !== 'aberto') {
            throw new InvalidArgumentException('Apostas encerradas para este jogo');
        }

        $liveStatuses = ['1H','2H','ET','BT','P','HT','LIVE','INT'];
        if (in_array(strtoupper($game['status_api'] ?? ''), $liveStatuses, true)) {
            throw new InvalidArgumentException('Apostas encerradas: jogo já está em andamento');
        }

        $gameDate = new DateTime($game['data_hora']);
        if ($gameDate <= new DateTime()) {
            throw new InvalidArgumentException('Apostas encerradas: jogo já iniciou');
        }

        $maxAnticipation = new DateTime('+7 days');
        if ($gameDate > $maxAnticipation) {
            throw new InvalidArgumentException('Apostas só são permitidas até 7 dias antes do jogo');
        }

        $multiplicador = max(1, min(1000, $multiplicador));
        $valorBase     = (float) ($game['valor_base'] ?? 1.00);
        $betPercent    = (float) $this->configRepo->get('bet_percent', 10) / 100;
        $possivelGanho = round($valorBase * $multiplicador, 2);
        $valor         = round($possivelGanho * $betPercent, 2);

        if ($valor <= 0 || $valor > $this->config['limits']['max_bet_value']) {
            throw new InvalidArgumentException('Valor da aposta fora do limite permitido');
        }
        if ($possivelGanho > $this->config['limits']['max_gain_per_bet']) {
            throw new InvalidArgumentException('Ganho potencial excede o limite por aposta');
        }

        $id = $this->bets->create([
            'user_id'       => $userId,
            'jogo_id'       => $jogoId,
            'placar_casa'   => $placarCasa,
            'placar_fora'   => $placarFora,
            'valor'         => $valor,
            'odd'           => $multiplicador, // armazena o multiplicador escolhido
            'possivel_ganho' => $possivelGanho,
            'status'        => 'pendente',
        ]);

        Logger::info('Aposta criada', ['bet_id' => $id, 'user_id' => $userId, 'game_id' => $jogoId, 'mult' => $multiplicador]);
        return [
            'id'            => $id,
            'jogo_id'       => $jogoId,
            'placar_casa'   => $placarCasa,
            'placar_fora'   => $placarFora,
            'valor'         => $valor,
            'multiplicador' => $multiplicador,
            'possivel_ganho' => $possivelGanho,
            'status'        => 'pendente',
        ];
    }

    /**
     * Inicia o pagamento de uma aposta via gateway.
     * Retorna dados da cobrança PIX para o frontend.
     */
    public function payBet(int $userId, int $betId, PaymentGatewayInterface $gateway): array
    {
        $bet = $this->bets->find($betId);
        if (!$bet || (int) $bet['user_id'] !== $userId) {
            throw new InvalidArgumentException('Aposta não encontrada');
        }
        if ($bet['status'] !== 'pendente') {
            throw new InvalidArgumentException('Aposta não está pendente');
        }

        $charge = $gateway->createPixCharge(
            (float) $bet['valor'],
            'BetCopa — Aposta #' . $betId,
            'bet-' . $betId . '-' . $userId
        );

        // Persiste cobrança se o repositório estiver disponível
        if ($this->paymentsRepo !== null) {
            $this->paymentsRepo->create(
                $betId,
                $gateway->getName(),
                $charge['payment_id'],
                $charge['qr_code'],
                $charge['qr_code_base64'],
                (float) $bet['valor'],
                $charge['expires_at']
            );
        }

        $this->bets->updateStatus($betId, 'pago');
        Logger::info('Cobrança PIX criada', ['bet_id' => $betId, 'gateway' => $gateway->getName()]);

        return [
            'gateway'        => $gateway->getName(),
            'qr_code'        => $charge['qr_code'],
            'qr_code_base64' => $charge['qr_code_base64'],
            'expires_at'     => $charge['expires_at'],
        ];
    }

    /**
     * Confirma o pagamento verificando o status real no gateway.
     */
    public function confirmPayment(int $userId, int $betId, PaymentGatewayInterface $gateway): void
    {
        $bet = $this->bets->find($betId);
        if (!$bet || (int) $bet['user_id'] !== $userId) {
            throw new InvalidArgumentException('Aposta não encontrada');
        }
        if ($bet['status'] !== 'pago') {
            throw new InvalidArgumentException('Pagamento ainda não processado');
        }

        // Verifica status do pagamento antes de confirmar
        if ($this->paymentsRepo !== null) {
            $payment = $this->paymentsRepo->findByBetId($betId);
            if ($payment) {
                // Se já aprovado localmente (pelo webhook), confirma direto
                if (($payment['status'] ?? '') === 'approved') {
                    $this->bets->updateStatus($betId, 'confirmado');
                    $this->transactions->create($userId, 'debito', (float) $bet['valor'], 'Aposta confirmada #' . $betId);
                    Logger::info('Pagamento confirmado (webhook)', ['bet_id' => $betId, 'gateway' => $gateway->getName()]);
                    return;
                }

                // Caso contrário, consulta o gateway
                if ($payment['gateway_payment_id'] !== '') {
                    $status = $gateway->getPaymentStatus($payment['gateway_payment_id']);
                    if ($status === 'rejected' || $status === 'cancelled') {
                        throw new InvalidArgumentException('Pagamento recusado pelo gateway');
                    }
                    if ($status === 'pending') {
                        throw new InvalidArgumentException('Pagamento ainda não confirmado. Aguarde ou tente novamente.');
                    }
                    $this->paymentsRepo->updateStatus((int) $payment['id'], 'approved');
                }
            }
        }

        $this->bets->updateStatus($betId, 'confirmado');
        $this->transactions->create($userId, 'debito', (float) $bet['valor'], 'Aposta confirmada #' . $betId);
        Logger::info('Pagamento confirmado', ['bet_id' => $betId, 'gateway' => $gateway->getName()]);
    }

    public function processResult(int $gameId): void
    {
        $game = $this->games->find($gameId);
        if (empty($game['placar_real'])) {
            throw new InvalidArgumentException('Resultado não informado');
        }

        [$realCasa, $realFora] = array_map('intval', explode('x', $game['placar_real']));
        $bets = $this->bets->confirmedByGame($gameId);

        foreach ($bets as $bet) {
            $acertou = (int) $bet['placar_casa'] === $realCasa && (int) $bet['placar_fora'] === $realFora;
            $status  = $acertou ? 'ganhou' : 'perdido';
            if ($acertou) {
                $this->transactions->create((int) $bet['user_id'], 'credito', (float) $bet['possivel_ganho'], 'Prêmio aposta #' . $bet['id']);
            }
            $this->bets->updateStatus((int) $bet['id'], $status);
            Logger::info('Aposta processada', ['bet_id' => $bet['id'], 'status' => $status]);
        }
    }
}
