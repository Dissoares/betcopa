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

        // Converte datetime-local (2025-05-05T15:20) → MySQL (2025-05-05 15:20:00)
        $dataHora = str_replace('T', ' ', $data['data_hora']);
        if (strlen($dataHora) === 16) $dataHora .= ':00'; // adiciona segundos se faltar

        // Filtra apenas os campos que o INSERT espera — evita "parameter was not defined"
        $insert = [
            'time_casa'     => trim($data['time_casa']),
            'time_fora'     => trim($data['time_fora']),
            'bandeira_casa' => mb_substr(trim($data['bandeira_casa'] ?? '⚽'), 0, 10),
            'bandeira_fora' => mb_substr(trim($data['bandeira_fora'] ?? '⚽'), 0, 10),
            'data_hora'     => $dataHora,
            'status'        => 'aberto',
            'odd'           => 1.00,
            'valor_base'    => max(0.50, min(50.00, (float) ($data['valor_base'] ?? 1.00))),
        ];

        $id = $this->games->create($insert);
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
