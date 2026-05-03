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
              (SELECT COUNT(*)                FROM users)                                               AS total_usuarios,
              (SELECT COUNT(*)                FROM apostas)                                             AS total_apostas,
              (SELECT COUNT(*)                FROM apostas WHERE status = 'pendente')                   AS apostas_pendentes,
              (SELECT COUNT(*)                FROM apostas WHERE status = 'confirmado')                 AS apostas_confirmadas,
              (SELECT COUNT(*)                FROM apostas WHERE status = 'ganhou')                     AS apostas_ganhas,
              (SELECT COUNT(*)                FROM apostas WHERE status = 'perdido')                    AS apostas_perdidas,
              (SELECT COALESCE(SUM(valor),0)  FROM apostas WHERE status IN ('confirmado','ganhou','perdido')) AS volume_apostado,
              (SELECT COALESCE(SUM(possivel_ganho),0) FROM apostas WHERE status = 'ganhou')            AS volume_pago,
              (SELECT COUNT(*)                FROM jogos  WHERE status = 'aberto')                     AS jogos_abertos,
              (SELECT COUNT(*)                FROM jogos  WHERE status = 'finalizado')                 AS jogos_finalizados,
              (SELECT COUNT(*)                FROM users  WHERE bloqueado = 1)                         AS usuarios_bloqueados
        ")->fetch();

        $stats['margem_casa'] = (float)$stats['volume_apostado'] - (float)$stats['volume_pago'];
        return $stats;
    }

    public function listUsers(): array
    {
        return $this->db->query("
            SELECT
              u.id, u.nome, u.email, u.bloqueado, u.criado_em,
              COUNT(a.id)                                   AS total_apostas,
              COALESCE(SUM(CASE WHEN a.status='ganhou' THEN 1 END), 0) AS apostas_ganhas,
              COALESCE(
                (SELECT SUM(CASE WHEN t.tipo='credito' THEN t.valor ELSE -t.valor END)
                 FROM transacoes t WHERE t.user_id = u.id), 0
              )                                             AS saldo
            FROM users u
            LEFT JOIN apostas a ON a.user_id = u.id
            GROUP BY u.id
            ORDER BY u.criado_em DESC
        ")->fetchAll();
    }

    public function listBets(int $jogoId = 0, string $status = ''): array
    {
        $where = [];
        $params = [];

        if ($jogoId) {
            $where[] = 'a.jogo_id = :jogo_id';
            $params['jogo_id'] = $jogoId;
        }
        if ($status) {
            $where[] = 'a.status = :status';
            $params['status'] = $status;
        }

        $sql = "
            SELECT
              a.id, a.status, a.valor, a.odd AS multiplicador, a.possivel_ganho,
              a.placar_casa, a.placar_fora, a.criado_em,
              u.nome AS usuario, u.email AS usuario_email,
              j.time_casa, j.time_fora, j.data_hora, j.placar_real
            FROM apostas a
            JOIN users u ON u.id = a.user_id
            JOIN jogos  j ON j.id = a.jogo_id
            " . ($where ? 'WHERE ' . implode(' AND ', $where) : '') . "
            ORDER BY a.criado_em DESC
            LIMIT 200
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function betStatsByGame(): array
    {
        return $this->db->query("
            SELECT
              j.id, j.time_casa, j.time_fora, j.status,
              COUNT(a.id)                                        AS total_apostas,
              COALESCE(SUM(CASE WHEN a.status IN ('confirmado','ganhou','perdido') THEN a.valor END), 0) AS arrecadado,
              COALESCE(SUM(CASE WHEN a.status = 'ganhou' THEN a.possivel_ganho END), 0)                 AS pago,
              COALESCE(SUM(CASE WHEN a.status = 'pendente' THEN 1 END), 0)                              AS pendentes
            FROM jogos j
            LEFT JOIN apostas a ON a.jogo_id = j.id
            GROUP BY j.id
            ORDER BY j.data_hora DESC
        ")->fetchAll();
    }

    public function recentBets(int $limit = 10): array
    {
        $stmt = $this->db->prepare("
            SELECT a.id, a.status, a.valor, a.possivel_ganho, a.criado_em,
                   u.nome AS usuario,
                   j.time_casa, j.time_fora
            FROM apostas a
            JOIN users u ON u.id = a.user_id
            JOIN jogos  j ON j.id = a.jogo_id
            ORDER BY a.criado_em DESC
            LIMIT :lim
        ");
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }
}
