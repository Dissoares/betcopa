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
        $tz  = new DateTimeZone('America/Sao_Paulo');
        $now = (new DateTime('now', $tz))->format('Y-m-d H:i:s');
        $this->games->expireOldGames($now);
        return $this->games->all();
    }

    public function createGame(array $data): int
    {
        if (empty($data['time_casa']) || empty($data['time_fora']) || empty($data['data_hora'])) {
            throw new InvalidArgumentException('Dados de jogo inválidos');
        }

        $data['status']     = $data['status'] ?? 'aberto';
        $data['odd']        = max(1.00, (float) ($data['odd'] ?? 1.00));
        $data['valor_base'] = max(0.50, min(50.00, (float) ($data['valor_base'] ?? 1.00)));
        $data['bandeira_casa'] = mb_substr(trim($data['bandeira_casa'] ?? '⚽'), 0, 10);
        $data['bandeira_fora'] = mb_substr(trim($data['bandeira_fora'] ?? '⚽'), 0, 10);

        if ($data['status'] === 'finalizado') {
            $home = isset($data['placar_casa']) ? (int) $data['placar_casa'] : null;
            $away = isset($data['placar_fora']) ? (int) $data['placar_fora'] : null;
            if ($home !== null && $away !== null) {
                $data['placar_real'] = sprintf('%dx%d', $home, $away);
            }
        }

        $id = $this->games->create($data);
        Logger::info('Jogo criado', ['id' => $id]);
        return $id;
    }

    public function updateGame(int $id, array $data): void
    {
        $game = $this->games->find($id);
        if (!$game) {
            throw new InvalidArgumentException('Jogo não encontrado');
        }

        if (empty($data['time_casa']) || empty($data['time_fora']) || empty($data['data_hora'])) {
            throw new InvalidArgumentException('Dados de jogo inválidos');
        }

        $data['status']        = $data['status'] ?? $game['status'];
        $data['status_api']    = strtoupper(trim($data['status_api'] ?? ''));
        $data['odd']           = max(1.00, (float) ($data['odd'] ?? 1.00));
        $data['valor_base']    = max(0.50, min(50.00, (float) ($data['valor_base'] ?? 1.00)));
        $data['bandeira_casa'] = mb_substr(trim($data['bandeira_casa'] ?? '⚽'), 0, 10);
        $data['bandeira_fora'] = mb_substr(trim($data['bandeira_fora'] ?? '⚽'), 0, 10);

        $home = isset($data['placar_casa']) && $data['placar_casa'] !== '' ? (int) $data['placar_casa'] : null;
        $away = isset($data['placar_fora']) && $data['placar_fora'] !== '' ? (int) $data['placar_fora'] : null;
        $data['placar_real'] = ($home !== null && $away !== null) ? sprintf('%dx%d', $home, $away) : null;

        $this->games->update($id, $data);
        Logger::info('Jogo atualizado', ['id' => $id]);
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
