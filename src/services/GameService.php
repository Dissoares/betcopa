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
        $data['status'] = 'aberto';
        $data['odd'] = max(1.10, min(5.00, (float) $data['odd']));
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
        Logger::info('Resultado inscrito', ['id' => $id, 'placar' => $placar]);
    }
}
