<?php
class GameRepository
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function all(): array
    {
        $stmt = $this->db->query('SELECT * FROM jogos ORDER BY data_hora ASC');
        return $stmt->fetchAll();
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM jogos WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return $stmt->fetch() ?: null;
    }

    /** Criação manual pelo admin (sem API). */
    public function create(array $data): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO jogos
               (time_casa, time_fora, bandeira_casa, bandeira_fora, data_hora, status, odd, valor_base, placar_real)
             VALUES
               (:time_casa, :time_fora, :bandeira_casa, :bandeira_fora, :data_hora, :status, :odd, :valor_base, :placar_real)'
        );
        $stmt->execute([
            'time_casa'      => $data['time_casa'],
            'time_fora'      => $data['time_fora'],
            'bandeira_casa'  => $data['bandeira_casa'],
            'bandeira_fora'  => $data['bandeira_fora'],
            'data_hora'      => $data['data_hora'],
            'status'         => $data['status'],
            'odd'            => $data['odd'],
            'valor_base'     => $data['valor_base'],
            'placar_real'    => $data['placar_real'] ?? null,
        ]);
        return (int) $this->db->lastInsertId();
    }

    /**
     * Insert ou update de jogo importado da API-Football.
     * Identifica duplicatas pelo api_fixture_id.
     * Retorna o id do registro.
     */
    public function upsertByApiId(array $data): int
    {
        $stmt = $this->db->prepare('SELECT id FROM jogos WHERE api_fixture_id = :api_fixture_id');
        $stmt->execute(['api_fixture_id' => $data['api_fixture_id']]);
        $existing = $stmt->fetch();

        if ($existing) {
            // Atualiza tudo exceto valor_base (não sobrescreve customização do admin)
            $stmt = $this->db->prepare(
                'UPDATE jogos SET
                   time_casa = :time_casa,
                   time_fora = :time_fora,
                   logo_casa = :logo_casa,
                   logo_fora = :logo_fora,
                   data_hora = :data_hora,
                   liga_nome = :liga_nome,
                   liga_logo = :liga_logo,
                   estadio   = :estadio,
                   rodada    = :rodada,
                   status_api = :status_api
                 WHERE id = :id'
            );
            $stmt->execute([
                'time_casa'  => $data['time_casa'],
                'time_fora'  => $data['time_fora'],
                'logo_casa'  => $data['logo_casa'],
                'logo_fora'  => $data['logo_fora'],
                'data_hora'  => $data['data_hora'],
                'liga_nome'  => $data['liga_nome'],
                'liga_logo'  => $data['liga_logo'],
                'estadio'    => $data['estadio'],
                'rodada'     => $data['rodada'],
                'status_api' => $data['status_api'],
                'id'         => $existing['id'],
            ]);
            return (int) $existing['id'];
        }

        $stmt = $this->db->prepare(
            'INSERT INTO jogos
               (api_fixture_id, time_casa, time_fora, bandeira_casa, bandeira_fora,
                logo_casa, logo_fora, data_hora, status, liga_nome, liga_logo,
                estadio, rodada, odd, valor_base, status_api)
             VALUES
               (:api_fixture_id, :time_casa, :time_fora, :bandeira_casa, :bandeira_fora,
                :logo_casa, :logo_fora, :data_hora, :status, :liga_nome, :liga_logo,
                :estadio, :rodada, :odd, :valor_base, :status_api)'
        );
        $stmt->execute([
            'api_fixture_id' => $data['api_fixture_id'],
            'time_casa'      => $data['time_casa'],
            'time_fora'      => $data['time_fora'],
            'bandeira_casa'  => $data['bandeira_casa'] ?? '',
            'bandeira_fora'  => $data['bandeira_fora'] ?? '',
            'logo_casa'      => $data['logo_casa']     ?? '',
            'logo_fora'      => $data['logo_fora']     ?? '',
            'data_hora'      => $data['data_hora'],
            'status'         => $data['status'],
            'liga_nome'      => $data['liga_nome']     ?? '',
            'liga_logo'      => $data['liga_logo']     ?? '',
            'estadio'        => $data['estadio']       ?? '',
            'rodada'         => $data['rodada']        ?? '',
            'odd'            => $data['odd']           ?? 1.00,
            'valor_base'     => $data['valor_base']    ?? 1.00,
            'status_api'     => $data['status_api'],
        ]);
        return (int) $this->db->lastInsertId();
    }

    /**
     * Retorna jogos importados da API que ainda não foram finalizados.
     * Usado pelo sync de resultados.
     */
    public function findPendingSync(): array
    {
        $stmt = $this->db->query(
            "SELECT * FROM jogos
             WHERE api_fixture_id IS NOT NULL
               AND status != 'finalizado'
             ORDER BY data_hora ASC"
        );
        return $stmt->fetchAll();
    }

    public function update(int $id, array $data): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE jogos SET
               time_casa     = :time_casa,
               time_fora     = :time_fora,
               bandeira_casa = :bandeira_casa,
               bandeira_fora = :bandeira_fora,
               data_hora     = :data_hora,
               status        = :status,
               status_api    = :status_api,
               odd           = :odd,
               valor_base    = :valor_base,
               placar_real   = :placar_real
             WHERE id = :id'
        );
        return $stmt->execute([
            'time_casa'     => $data['time_casa'],
            'time_fora'     => $data['time_fora'],
            'bandeira_casa' => $data['bandeira_casa'],
            'bandeira_fora' => $data['bandeira_fora'],
            'data_hora'     => $data['data_hora'],
            'status'        => $data['status'],
            'status_api'    => $data['status_api'] ?? '',
            'odd'           => $data['odd'],
            'valor_base'    => $data['valor_base'],
            'placar_real'   => $data['placar_real'] ?? null,
            'id'            => $id,
        ]);
    }

    public function updateResult(int $id, string $placarReal): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE jogos SET placar_real = :placar_real, status = :status, status_api = :status_api WHERE id = :id'
        );
        return $stmt->execute([
            'placar_real' => $placarReal,
            'status'      => 'finalizado',
            'status_api'  => 'FT',
            'id'          => $id,
        ]);
    }

    public function updateStatus(int $id, string $status, string $statusApi = ''): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE jogos SET status = :status, status_api = :status_api WHERE id = :id'
        );
        return $stmt->execute([
            'status'     => $status,
            'status_api' => $statusApi ?: $status,
            'id'         => $id,
        ]);
    }

    public function updateLiveScore(int $id, string $placarReal): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE jogos SET placar_real = :placar_real WHERE id = :id'
        );
        return $stmt->execute(['placar_real' => $placarReal, 'id' => $id]);
    }

    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM jogos WHERE id = :id');
        return $stmt->execute(['id' => $id]);
    }
}
