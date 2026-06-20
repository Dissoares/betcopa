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

        $winnersMap = [];
        $nearMap    = [];

        foreach ($rows as $row) {
            $uid      = (int) $row['user_id'];
            $isSeed   = str_ends_with($row['email'] ?? '', '.seed@betcopa.local');
            $parts    = explode('x', $row['placar_real']);
            $distance = abs((int)$row['placar_casa'] - (int)$parts[0])
                      + abs((int)$row['placar_fora']  - (int)$parts[1]);
            $entry = [
                'nome'          => maskUserName($row['nome']),
                'nome_real'     => $row['nome'],
                'jogo'          => $row['time_casa'] . ' x ' . $row['time_fora'],
                'bandeira_casa' => $row['bandeira_casa'] ?? '',
                'bandeira_fora' => $row['bandeira_fora'] ?? '',
                'logo_casa'     => $row['logo_casa']     ?? '',
                'logo_fora'     => $row['logo_fora']     ?? '',
                'aposta'        => $row['placar_casa'] . ' x ' . $row['placar_fora'],
                'resultado'     => $row['placar_real'] ?? '',
                'diferenca'     => $distance,
                'ganho'         => (float) $row['possivel_ganho'],
                'seed'          => $isSeed,
            ];

            $isWinner = $row['status'] === 'ganhou'
                     || ($row['placar_casa'] === $parts[0] && $row['placar_fora'] === $parts[1]);

            if ($isWinner) {
                if (!isset($winnersMap[$uid]) || $entry['ganho'] > $winnersMap[$uid]['ganho']) {
                    $winnersMap[$uid] = $entry;
                }
            } else {
                if (!isset($nearMap[$uid]) || $entry['diferenca'] < $nearMap[$uid]['diferenca']) {
                    $nearMap[$uid] = $entry;
                }
            }
        }

        $winners = array_values($winnersMap);
        $near    = array_values($nearMap);

        // Reais primeiro; dentro de cada grupo, ordenado por prêmio/distância
        usort($winners, function($a, $b) {
            if ($a['seed'] !== $b['seed']) return $a['seed'] <=> $b['seed']; // false (real) = 0 vem antes de true (seed) = 1
            return $b['ganho'] <=> $a['ganho'];
        });
        usort($near, function($a, $b) {
            if ($a['seed'] !== $b['seed']) return $a['seed'] <=> $b['seed'];
            return $a['diferenca'] <=> $b['diferenca'];
        });

        jsonResponse(['vencedores' => array_slice($winners, 0, 10), 'quase' => array_slice($near, 0, 10)]);
    }
}
