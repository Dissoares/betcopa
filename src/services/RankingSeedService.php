<?php
/**
 * Popula / atualiza apostas seed para a página de Ganhadores.
 *
 * Lógica:
 *  - Mantém 10 usuários seed fixos (emails *.seed@betcopa.local).
 *  - A cada execução troca o nome (primeiro + sobrenome) aleatoriamente.
 *  - Para cada jogo finalizado: faz UPSERT das apostas seed.
 *    • 4 ganhadores  — placar exato, valor/prêmio aleatório.
 *    • 6 chegaram perto — placar ±1 gol, valor/prêmio aleatório.
 *  - Se a aposta seed já existe naquele jogo → UPDATE (nome, placar, valor, prêmio).
 *  - Se não existe → INSERT.
 *  - Valores sorteados dentro de stake_min … stake_max (configurações).
 */
class RankingSeedService
{
    private PDO $db;

    private static array $NOMES_M = [
        'Carlos','João','Pedro','Lucas','Rafael','Bruno','Diego',
        'Felipe','Gustavo','Rodrigo','Thiago','André','Vinicius',
        'Henrique','Matheus','Gabriel','Leonardo','Eduardo','Fernando','Igor',
    ];
    private static array $NOMES_F = [
        'Maria','Ana','Fernanda','Beatriz','Camila','Juliana','Larissa',
        'Mariana','Amanda','Natalia','Patricia','Vanessa','Carolina',
        'Gabriela','Leticia','Isabela','Renata','Aline','Priscila','Tainá',
    ];
    private static array $SOBRENOMES = [
        'Silva','Oliveira','Pereira','Lima','Mendes','Costa','Rocha','Nunes',
        'Alves','Ferreira','Santos','Souza','Ribeiro','Carvalho','Gomes',
        'Martins','Rodrigues','Fernandes','Araújo','Melo','Barbosa',
        'Nascimento','Xavier','Monteiro','Cardoso','Teixeira','Moreira',
        'Vieira','Castro','Dias',
    ];

    // 10 emails fixos — 5 masculinos, 5 femininos
    private static array $SEED_EMAILS = [
        'seed_m1.seed@betcopa.local',
        'seed_m2.seed@betcopa.local',
        'seed_m3.seed@betcopa.local',
        'seed_m4.seed@betcopa.local',
        'seed_m5.seed@betcopa.local',
        'seed_f1.seed@betcopa.local',
        'seed_f2.seed@betcopa.local',
        'seed_f3.seed@betcopa.local',
        'seed_f4.seed@betcopa.local',
        'seed_f5.seed@betcopa.local',
    ];

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function run(int $onlyGameId = 0): array
    {
        [$stakeMin, $stakeMax, $oddPadrao] = $this->loadConfig();

        $userIds = $this->refreshSeedUsers();

        $games = $this->loadFinishedGames($onlyGameId);
        if (empty($games)) {
            return ['ok' => false, 'erro' => 'Nenhum jogo finalizado com placar encontrado.'];
        }

        $inserted = 0;

        // Placeholders para os IDs dos seed users (para DELETE)
        $ph = implode(',', array_fill(0, count($userIds), '?'));

        foreach ($games as $game) {
            [$rc, $rf] = array_map('intval', explode('x', $game['placar_real']));
            // Usa a odd do jogo; se não estiver definida, cai no odd_padrao do admin
            $odd    = (float) $game['odd'] ?: $oddPadrao;
            $gameId = (int) $game['id'];

            // Apaga TODAS as apostas seed deste jogo (qualquer email *.seed@betcopa.local)
            // para garantir que não sobrem registros antigos de seeds anteriores.
            $this->db->prepare(
                "DELETE a FROM apostas a
                   JOIN users u ON u.id = a.user_id
                  WHERE a.jogo_id = ?
                    AND u.email LIKE '%.seed@betcopa.local'"
            )->execute([$gameId]);

            // Embaralha usuários a cada jogo para variar quem ganha
            $pool = $userIds;
            shuffle($pool);

            // 4 ganhadores (acertaram o placar exato)
            $winners    = array_slice($pool, 0, 4);
            // 6 chegaram perto
            $nearMisses = array_slice($pool, 4, 6);

            $ins = $this->db->prepare(
                'INSERT INTO apostas
                   (user_id, jogo_id, placar_casa, placar_fora, valor, odd, possivel_ganho, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );

            foreach ($winners as $uid) {
                $val   = $this->randomStake($stakeMin, $stakeMax);
                $ganho = $this->calcPrize($val, $odd);
                $ins->execute([$uid, $gameId, $rc, $rf, $val, $odd, $ganho, 'ganhou']);
                $inserted++;
            }

            // Offsets variados para "chegaram perto" (distância ≤ 2 gols)
            $offsets = [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1]];
            shuffle($offsets);
            foreach ($nearMisses as $k => $uid) {
                [$oc, $of] = $offsets[$k];
                $pc = max(0, $rc + $oc);
                $pf = max(0, $rf + $of);
                if ($pc === $rc && $pf === $rf) { $pc = max(0, $pc + 1); }
                $val   = $this->randomStake($stakeMin, $stakeMax);
                $ganho = $this->calcPrize($val, $odd);
                $ins->execute([$uid, $gameId, $pc, $pf, $val, $odd, $ganho, 'perdido']);
                $inserted++;
            }
        }

        return [
            'ok'      => true,
            'jogos'   => count($games),
            'apostas' => $inserted,
        ];
    }

    // ── Privados ──────────────────────────────────────────────────

    private function refreshSeedUsers(): array
    {
        $hash  = password_hash('betcopa123', PASSWORD_BCRYPT);
        $ids   = [];

        foreach (self::$SEED_EMAILS as $i => $email) {
            $isFemale = $i >= 5;
            $nome     = $this->randomName($isFemale);

            $row = $this->db->prepare('SELECT id FROM users WHERE email = ?');
            $row->execute([$email]);
            $id = $row->fetchColumn();

            if ($id) {
                // Atualiza apenas o nome
                $this->db->prepare('UPDATE users SET nome = ? WHERE id = ?')
                         ->execute([$nome, $id]);
            } else {
                $this->db->prepare('INSERT INTO users (nome, email, senha) VALUES (?, ?, ?)')
                         ->execute([$nome, $email, $hash]);
                $id = (int) $this->db->lastInsertId();
            }

            $ids[] = (int) $id;
        }

        return $ids;
    }

    private function randomStake(float $min, float $max): float
    {
        // Valores "humanos" — apostadores escolhem números redondos.
        // Mais entradas pequenas que grandes para refletir comportamento real:
        // a maioria aposta pouco, poucos apostam muito.
        $pool = [
             1,  2,  2,  3,  5,  5,  5,  5,
             7, 10, 10, 10, 10, 10, 15, 15,
            20, 20, 20, 25, 25, 30, 30, 40,
            50, 50, 50, 60, 75, 80,
           100,100,120,150,200,250,300,400,500,
        ];

        $valid = array_values(array_filter($pool, fn($v) => $v >= $min && $v <= $max));

        return empty($valid) ? $min : (float) $valid[array_rand($valid)];
    }

    /** Prêmio idêntico ao modal: round(stake × odd, 2) */
    private function calcPrize(float $stake, float $odd): float
    {
        return round($stake * $odd, 2);
    }

    private function randomName(bool $female): string
    {
        $pool     = $female ? self::$NOMES_F : self::$NOMES_M;
        $surnames = self::$SOBRENOMES;
        return $pool[array_rand($pool)] . ' ' . $surnames[array_rand($surnames)];
    }

    private function loadConfig(): array
    {
        $rows = $this->db->query(
            "SELECT chave, valor FROM configuracoes WHERE chave IN ('stake_min','stake_max','odd_padrao')"
        )->fetchAll(PDO::FETCH_KEY_PAIR);

        return [
            max(1,   (float) ($rows['stake_min']  ?? 5)),    // stakeMin
            (float)          ($rows['stake_max']  ?? 500),   // stakeMax
            max(1.0, (float) ($rows['odd_padrao'] ?? 3.0)),  // oddPadrao (fallback)
        ];
    }

    private function loadFinishedGames(int $gameId): array
    {
        if ($gameId > 0) {
            $stmt = $this->db->prepare(
                "SELECT id, placar_real, odd FROM jogos
                  WHERE id = ? AND status = 'finalizado'
                    AND placar_real IS NOT NULL AND placar_real != ''"
            );
            $stmt->execute([$gameId]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        return $this->db->query(
            "SELECT id, placar_real, odd FROM jogos
              WHERE status = 'finalizado'
                AND placar_real IS NOT NULL AND placar_real != ''
              ORDER BY data_hora DESC"
        )->fetchAll(PDO::FETCH_ASSOC);
    }
}
