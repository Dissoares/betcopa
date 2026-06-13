<?php
class RankingController
{
    private BetRepository $bets;

    public function __construct(BetRepository $bets)
    {
        $this->bets = $bets;
    }

    public function index(): void
    {
        $rows = $this->bets->listCompleted();
        $winners = [];
        $near = [];

        foreach ($rows as $row) {
            $distance = abs((int)$row['placar_casa'] - (int)explode('x', $row['placar_real'])[0]) + abs((int)$row['placar_fora'] - (int)explode('x', $row['placar_real'])[1]);
            $entry = [
                'nome'   => maskUserName($row['nome']),
                'nome_real' => $row['nome'],
                'jogo'        => $row['time_casa'] . ' x ' . $row['time_fora'],
                'bandeira_casa' => $row['bandeira_casa'] ?? '',
                'bandeira_fora' => $row['bandeira_fora'] ?? '',
                'logo_casa'     => $row['logo_casa']     ?? '',
                'logo_fora'     => $row['logo_fora']     ?? '',
                'aposta'      => $row['placar_casa'] . ' x ' . $row['placar_fora'],
                'resultado'   => $row['placar_real'] ?? '',
                'diferenca' => $distance,
                'ganho'  => (float) $row['possivel_ganho'],
            ];

            if ($row['status'] === 'ganhou' || ($row['placar_casa'] === explode('x', $row['placar_real'])[0] && $row['placar_fora'] === explode('x', $row['placar_real'])[1])) {
                $winners[] = $entry;
            } else {
                $near[] = $entry;
            }
        }

        usort($winners, fn($a, $b) => $b['ganho'] <=> $a['ganho']);
        usort($near, fn($a, $b) => $a['diferenca'] <=> $b['diferenca']);

        jsonResponse(['vencedores' => $winners, 'quase' => array_slice($near, 0, 10)]);
    }
}
