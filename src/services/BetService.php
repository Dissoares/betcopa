<?php
class BetService
{
    private BetRepository $bets;
    private GameRepository $games;
    private TransactionRepository $transactions;
    private array $config;

    public function __construct(BetRepository $bets, GameRepository $games, TransactionRepository $transactions, array $config)
    {
        $this->bets         = $bets;
        $this->games        = $games;
        $this->transactions = $transactions;
        $this->config       = $config;
    }

    /**
     * Cria uma aposta com base no multiplicador escolhido pelo usuário (2–10×).
     * valor_pago   = valor_base do jogo × multiplicador
     * possivel_ganho = valor_pago × multiplicador
     */
    public function createBet(int $userId, int $jogoId, int $placarCasa, int $placarFora, int $multiplicador): array
    {
        $game = $this->games->find($jogoId);
        if (!$game) {
            throw new InvalidArgumentException('Jogo inválido');
        }

        $gameDate = new DateTime($game['data_hora']);
        if ($gameDate <= new DateTime()) {
            throw new InvalidArgumentException('Apostas encerradas para este jogo');
        }

        $multiplicador = max(2, min(10, $multiplicador));
        $valorBase     = (float) ($game['valor_base'] ?? 1.00);
        $valor         = round($valorBase * $multiplicador, 2);
        $possivelGanho = round($valor * $multiplicador, 2);

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

    public function payBet(int $userId, int $betId): void
    {
        $bet = $this->bets->find($betId);
        if (!$bet || (int) $bet['user_id'] !== $userId) {
            throw new InvalidArgumentException('Aposta não encontrada');
        }
        if ($bet['status'] !== 'pendente') {
            throw new InvalidArgumentException('Aposta não está pendente');
        }
        $this->bets->updateStatus($betId, 'pago');
        Logger::info('Pagamento simulado', ['bet_id' => $betId]);
    }

    public function confirmPayment(int $userId, int $betId): void
    {
        $bet = $this->bets->find($betId);
        if (!$bet || (int) $bet['user_id'] !== $userId) {
            throw new InvalidArgumentException('Aposta não encontrada');
        }
        if ($bet['status'] !== 'pago') {
            throw new InvalidArgumentException('Pagamento ainda não processado');
        }
        $this->bets->updateStatus($betId, 'confirmado');
        $this->transactions->create($userId, 'debito', (float) $bet['valor'], 'Aposta confirmada #' . $betId);
        Logger::info('Pagamento confirmado', ['bet_id' => $betId]);
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
