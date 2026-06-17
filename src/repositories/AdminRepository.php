<?php
class AdminRepository
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function dashboardStats(): array
    {
        $stats = $this->db->query("
            SELECT
              (SELECT COUNT(*) FROM users WHERE email NOT LIKE '%.seed@betcopa.local')                                                                           AS total_usuarios,
              (SELECT COUNT(*) FROM apostas a JOIN users u ON u.id = a.user_id WHERE u.email NOT LIKE '%.seed@betcopa.local')                                    AS total_apostas,
              (SELECT COUNT(*) FROM apostas a JOIN users u ON u.id = a.user_id WHERE u.email NOT LIKE '%.seed@betcopa.local' AND a.status = 'pendente')          AS apostas_pendentes,
              (SELECT COUNT(*) FROM apostas a JOIN users u ON u.id = a.user_id WHERE u.email NOT LIKE '%.seed@betcopa.local' AND a.status = 'confirmado')        AS apostas_confirmadas,
              (SELECT COUNT(*) FROM apostas a JOIN users u ON u.id = a.user_id WHERE u.email NOT LIKE '%.seed@betcopa.local' AND a.status = 'ganhou')            AS apostas_ganhas,
              (SELECT COUNT(*) FROM apostas a JOIN users u ON u.id = a.user_id WHERE u.email NOT LIKE '%.seed@betcopa.local' AND a.status = 'perdido')           AS apostas_perdidas,
              (SELECT COALESCE(SUM(a.valor),0) FROM apostas a JOIN users u ON u.id = a.user_id WHERE u.email NOT LIKE '%.seed@betcopa.local' AND a.status IN ('confirmado','ganhou','perdido')) AS volume_apostado,
              (SELECT COALESCE(SUM(a.possivel_ganho),0) FROM apostas a JOIN users u ON u.id = a.user_id WHERE u.email NOT LIKE '%.seed@betcopa.local' AND a.status = 'ganhou')                 AS volume_pago,
              (SELECT COUNT(*) FROM jogos WHERE status = 'aberto')                                                                                               AS jogos_abertos,
              (SELECT COUNT(*) FROM jogos WHERE status = 'finalizado')                                                                                           AS jogos_finalizados,
              (SELECT COUNT(*) FROM users WHERE bloqueado = 1 AND email NOT LIKE '%.seed@betcopa.local')                                                         AS usuarios_bloqueados
        ")->fetch();

        $stats['margem_casa'] = (float)$stats['volume_apostado'] - (float)$stats['volume_pago'];
        return $stats;
    }

    public function listUsers(int $page = 1, int $limit = 50): array
    {
        $offset = ($page - 1) * $limit;
        $stmt   = $this->db->prepare("
            SELECT
              u.id, u.nome, u.email, u.bloqueado, u.is_admin, u.criado_em,
              COUNT(a.id)                                   AS total_apostas,
              COALESCE(SUM(CASE WHEN a.status='ganhou' THEN 1 END), 0) AS apostas_ganhas,
              COALESCE(
                (SELECT SUM(CASE WHEN t.tipo='credito' THEN t.valor ELSE -t.valor END)
                 FROM transacoes t WHERE t.user_id = u.id), 0
              )                                             AS saldo
            FROM users u
            LEFT JOIN apostas a ON a.user_id = u.id
            GROUP BY u.id
            ORDER BY u.is_admin DESC, u.criado_em DESC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':limit',  $limit,  PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function countUsers(): int
    {
        return (int) $this->db->query("SELECT COUNT(*) FROM users")->fetchColumn();
    }

    public function listBets(int $jogoId = 0, string $status = '', int $page = 1, int $limit = 50): array
    {
        $where  = ["u.email NOT LIKE '%.seed@betcopa.local'"];
        $params = [];

        if ($jogoId) { $where[] = 'a.jogo_id = :jogo_id'; $params['jogo_id'] = $jogoId; }
        if ($status) { $where[] = 'a.status  = :status';  $params['status']  = $status; }

        $offset = ($page - 1) * $limit;

        $sql = "
            SELECT
              a.id, a.status, a.valor, a.odd AS multiplicador, a.possivel_ganho,
              a.placar_casa, a.placar_fora, a.criado_em,
              u.nome AS usuario, u.email AS usuario_email,
              j.time_casa, j.time_fora, j.data_hora, j.placar_real
            FROM apostas a
            JOIN users u ON u.id = a.user_id
            JOIN jogos  j ON j.id = a.jogo_id
            WHERE " . implode(' AND ', $where) . "
            ORDER BY a.criado_em DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->db->prepare($sql);
        foreach ($params as $key => $val) {
            $stmt->bindValue($key, $val);
        }
        $stmt->bindValue(':limit',  $limit,  PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function countBets(int $jogoId = 0, string $status = ''): int
    {
        $where  = ["u.email NOT LIKE '%.seed@betcopa.local'"];
        $params = [];

        if ($jogoId) { $where[] = 'a.jogo_id = :jogo_id'; $params['jogo_id'] = $jogoId; }
        if ($status) { $where[] = 'a.status  = :status';  $params['status']  = $status; }

        $sql  = "SELECT COUNT(*) FROM apostas a JOIN users u ON u.id = a.user_id WHERE " . implode(' AND ', $where);
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    public function betStatsByGame(int $page = 1, int $limit = 10): array
    {
        $offset = ($page - 1) * $limit;
        $stmt   = $this->db->prepare("
            SELECT
              j.id, j.time_casa, j.time_fora, j.status,
              COUNT(a.id)                                        AS total_apostas,
              COALESCE(SUM(CASE WHEN a.status IN ('confirmado','ganhou','perdido') THEN a.valor END), 0) AS arrecadado,
              COALESCE(SUM(CASE WHEN a.status = 'ganhou' THEN a.possivel_ganho END), 0)                 AS pago,
              COALESCE(SUM(CASE WHEN a.status = 'pendente' THEN 1 END), 0)                              AS pendentes
            FROM jogos j
            INNER JOIN apostas a ON a.jogo_id = j.id
            INNER JOIN users u ON u.id = a.user_id
            WHERE u.email NOT LIKE '%.seed@betcopa.local'
            GROUP BY j.id
            HAVING COUNT(a.id) > 0
            ORDER BY j.data_hora DESC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':limit',  $limit,  PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function countGames(): int
    {
        return (int) $this->db->query(
            "SELECT COUNT(DISTINCT j.id) FROM jogos j
             INNER JOIN apostas a ON a.jogo_id = j.id
             INNER JOIN users u ON u.id = a.user_id
             WHERE u.email NOT LIKE '%.seed@betcopa.local'"
        )->fetchColumn();
    }

    public function recentBets(int $limit = 10, int $offset = 0): array
    {
        $stmt = $this->db->prepare("
            SELECT a.id, a.status, a.valor, a.possivel_ganho, a.criado_em,
                   u.nome AS usuario,
                   j.time_casa, j.time_fora
            FROM apostas a
            JOIN users u ON u.id = a.user_id
            JOIN jogos  j ON j.id = a.jogo_id
            WHERE u.email NOT LIKE '%.seed@betcopa.local'
            ORDER BY a.criado_em DESC
            LIMIT :lim OFFSET :offset
        ");
        $stmt->bindValue(':lim',    $limit,  PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }
}
