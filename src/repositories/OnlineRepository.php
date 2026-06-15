<?php
class OnlineRepository
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
        try {
            $this->db->exec(
                "CREATE TABLE IF NOT EXISTS online_sessions (
                    session_id   VARCHAR(36)  NOT NULL,
                    user_id      INT          NULL,
                    page         VARCHAR(150) NULL,
                    source       VARCHAR(50)  NULL,
                    referrer     VARCHAR(500) NULL,
                    device       VARCHAR(10)  NULL,
                    ip           VARCHAR(45)  NULL,
                    country      VARCHAR(2)   NULL,
                    country_name VARCHAR(60)  NULL,
                    city         VARCHAR(80)  NULL,
                    region       VARCHAR(80)  NULL,
                    first_seen   DATETIME     NULL,
                    last_seen    DATETIME     NOT NULL,
                    PRIMARY KEY (session_id),
                    KEY idx_last_seen (last_seen)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );
        } catch (Exception $e) {}

        foreach ([
            'page         VARCHAR(150) NULL',
            'source       VARCHAR(50)  NULL',
            'referrer     VARCHAR(500) NULL',
            'device       VARCHAR(10)  NULL',
            'ip           VARCHAR(45)  NULL',
            'country      VARCHAR(2)   NULL',
            'country_name VARCHAR(60)  NULL',
            'city         VARCHAR(80)  NULL',
            'region       VARCHAR(80)  NULL',
            'first_seen   DATETIME     NULL',
        ] as $col) {
            try { $this->db->exec("ALTER TABLE online_sessions ADD COLUMN $col"); } catch (Exception $e) {}
        }
    }

    private function geoLookup(string $ip): array
    {
        if (!$ip) return [];
        // IPs privados/locais
        if (in_array($ip, ['127.0.0.1', '::1'])
            || str_starts_with($ip, '192.168.')
            || str_starts_with($ip, '10.')
            || preg_match('/^172\.(1[6-9]|2\d|3[01])\./', $ip)
        ) {
            return ['country' => '', 'country_name' => 'Local', 'city' => 'Localhost', 'region' => ''];
        }
        $ctx  = stream_context_create(['http' => ['timeout' => 3, 'ignore_errors' => true]]);
        $json = @file_get_contents(
            "http://ip-api.com/json/{$ip}?fields=status,country,countryCode,regionName,city",
            false, $ctx
        );
        if (!$json) return [];
        $data = json_decode($json, true);
        if (($data['status'] ?? '') !== 'success') return [];
        return [
            'country'      => $data['countryCode'] ?? null,
            'country_name' => $data['country']     ?? null,
            'city'         => $data['city']         ?? null,
            'region'       => $data['regionName']   ?? null,
        ];
    }

    public function upsert(
        string  $sessionId,
        ?int    $userId,
        ?string $page     = null,
        ?string $source   = null,
        ?string $referrer = null,
        ?string $device   = null,
        string  $ip       = ''
    ): void {
        $chk = $this->db->prepare(
            "SELECT first_seen FROM online_sessions WHERE session_id = ? LIMIT 1"
        );
        $chk->execute([$sessionId]);
        $existing = $chk->fetch(PDO::FETCH_ASSOC);

        if (!$existing) {
            $geo  = $this->geoLookup($ip);
            $stmt = $this->db->prepare(
                "INSERT INTO online_sessions
                    (session_id, user_id, page, source, referrer, device, ip,
                     country, country_name, city, region, first_seen, last_seen)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())"
            );
            $stmt->execute([
                $sessionId, $userId, $page, $source, $referrer, $device, $ip ?: null,
                $geo['country']      ?? null,
                $geo['country_name'] ?? null,
                $geo['city']         ?? null,
                $geo['region']       ?? null,
            ]);
        } else {
            $stmt = $this->db->prepare(
                "UPDATE online_sessions
                 SET user_id = ?, page = ?, source = ?, referrer = ?, device = ?, last_seen = NOW()
                 WHERE session_id = ?"
            );
            $stmt->execute([$userId, $page, $source, $referrer, $device, $sessionId]);
        }

        $this->db->exec(
            "DELETE FROM online_sessions WHERE last_seen < DATE_SUB(NOW(), INTERVAL 5 MINUTE)"
        );
    }

    public function stats(): array
    {
        $stmt = $this->db->query(
            "SELECT
                COUNT(*)                 AS total,
                SUM(user_id IS NOT NULL) AS usuarios,
                SUM(user_id IS NULL)     AS visitantes
             FROM online_sessions
             WHERE last_seen >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)"
        );
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return [
            'total'      => (int) ($row['total']      ?? 0),
            'usuarios'   => (int) ($row['usuarios']   ?? 0),
            'visitantes' => (int) ($row['visitantes'] ?? 0),
        ];
    }

    public function listOnlineUsers(): array
    {
        $stmt = $this->db->query(
            "SELECT u.id, u.nome, u.email,
                    os.page, os.source, os.referrer, os.device,
                    os.ip, os.country, os.country_name, os.city, os.region,
                    os.first_seen, os.last_seen
             FROM online_sessions os
             JOIN users u ON os.user_id = u.id
             WHERE os.last_seen >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)
             ORDER BY os.last_seen DESC"
        );
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function listAllSessions(): array
    {
        $stmt = $this->db->query(
            "SELECT os.session_id, os.user_id,
                    os.page, os.source, os.referrer, os.device,
                    os.ip, os.country, os.country_name, os.city, os.region,
                    os.first_seen, os.last_seen,
                    u.nome, u.email
             FROM online_sessions os
             LEFT JOIN users u ON os.user_id = u.id
             WHERE os.last_seen >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)
             ORDER BY os.last_seen DESC"
        );
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
