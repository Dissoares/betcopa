<?php
class BetService
{
    private BetRepository $bets;
    private GameRepository $games;
    private TransactionRepository $transactions;
    private array $config;

    public function __construct(BetRepository $bets, GameRepository $games, TransactionRepository $transactions, array $config)
    {
        $this->bets = $bets;
        $this->games = $games;
        $this->transactions = $transactions;
        $this->config = $config;
    }

    public function createBet(int $userId, int $jogoId, int $placarCasa, int $placarFora, float $valor): array
    {
        $game = $this->games->find($jogoId);
        if (!$game) {
            throw new InvalidArgumentException('Jogo inválido');
        }

        $gameDate = new DateTime($game['data_hora']);
        $now = new DateTime();
        if ($gameDate <= $now) {
            throw new InvalidArgumentException('Aposta somente antes do horário do jogo');
        }
        if ($valor <= 0 || $valor > $this->config['limits']['max_bet_value']) {
            throw new InvalidArgumentException('Valor da aposta inválido');
        }

        $odd = (float) $game['odd'];
        $possivelGanho = round($valor * $odd, 2);
        if ($possivelGanho > $this->config['limits']['max_gain_per_bet']) {
            throw new InvalidArgumentException('Valor de ganho excede o limite por aposta');
        }

        $id = $this->bets->create([
            'user_id' => $userId,
            'jogo_id' => $jogoId,
            'placar_casa' => $placarCasa,
            'placar_fora' => $placarFora,
            'valor' => $valor,
            'odd' => $odd,
            'possivel_ganho' => $possivelGanho,
            'status' => 'pendente',
        ]);

        Logger::info('Aposta criada', ['bet_id' => $id, 'user_id' => $userId, 'game_id' => $jogoId]);
        return array_merge(['id' => $id], compact('jogoId', 'placarCasa', 'placarFora', 'valor', 'odd', 'possivelGanho'));
    }

    public function payBet(int $userId, int $betId): void
    {
        $bet = $this->bets->find($betId);
        if (!$bet || $bet['user_id'] !== $userId) {
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
        if (!$bet || $bet['user_id'] !== $userId) {
            throw new InvalidArgumentException('Aposta não encontrada');
        }
        if ($bet['status'] !== 'pago') {
            throw new InvalidArgumentException('Pagamento ainda não processado');
        }

        $balance = $this->transactions->balance($userId);
        if ($balance < $bet['valor']) {
            throw new InvalidArgumentException('Saldo insuficiente para confirmar aposta');
        }

        $this->transactions->create($userId, 'debito', $bet['valor'], 'Aposta confirmada #'.$betId);
        $this->bets->updateStatus($betId, 'confirmado');
        Logger::info('Pagamento confirmado', ['bet_id' => $betId, 'user_id' => $userId]);
    }

    public function processResult(int $gameId): void
    {
        $bets = $this->bets->confirmedByGame($gameId);
        if (empty($bets)) {
            return;
        }

        $game = $this->games->find($gameId);
        if (empty($game['placar_real'])) {
            throw new InvalidArgumentException('Resultado não informado');
        }

        [$realCasa, $realFora] = array_map('intval', explode('x', $game['placar_real']));
        foreach ($bets as $bet) {
            $status = 'perdido';
            if ((int) $bet['placar_casa'] === $realCasa && (int) $bet['placar_fora'] === $realFora) {
                $status = 'ganhou';
                $this->transactions->create((int) $bet['user_id'], 'credito', (float) $bet['possivel_ganho'], 'Ganho aposta #'.$bet['id']);
            }
            $this->bets->updateStatus((int) $bet['id'], $status);
            Logger::info('Aposta processada', ['bet_id' => $bet['id'], 'status' => $status]);
        }
    }
}
