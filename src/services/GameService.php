<?php
class GameService
{
    private GameRepository $games;

    public function __construct(GameRepository $games)
    {
        $this->games = $games;
    }

    public function listGames(): array
    {
        return $this->games->all();
    }

    public function createGame(array $data): int
    {
        if (empty($data['time_casa']) || empty($data['time_fora']) || empty($data['data_hora'])) {
            throw new InvalidArgumentException('Dados de jogo inválidos');
        }
        $data['status']       = 'aberto';
        $data['odd']          = 1.00; // campo legado mantido
        $data['valor_base']   = max(0.50, min(50.00, (float) ($data['valor_base'] ?? 1.00)));
        $data['bandeira_casa'] = mb_substr(trim($data['bandeira_casa'] ?? '⚽'), 0, 10);
        $data['bandeira_fora'] = mb_substr(trim($data['bandeira_fora'] ?? '⚽'), 0, 10);

        $id = $this->games->create($data);
        Logger::info('Jogo criado', ['id' => $id]);
        return $id;
    }

    public function setResult(int $id, int $casa, int $fora): void
    {
        $game = $this->games->find($id);
        if (!$game) {
            throw new InvalidArgumentException('Jogo não encontrado');
        }
        $placar = sprintf('%dx%d', $casa, $fora);
        $this->games->updateResult($id, $placar);
        Logger::info('Resultado inserido', ['id' => $id, 'placar' => $placar]);
    }
}
