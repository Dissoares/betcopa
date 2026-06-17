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
                    session_id    VARCHAR(36)  NOT NULL,
                    user_id       INT          NULL,
                    page          VARCHAR(150) NULL,
                    source        VARCHAR(50)  NULL,
                    referrer      VARCHAR(500) NULL,
                    device        VARCHAR(10)  NULL,
                    ip            VARCHAR(45)  NULL,
                    country       VARCHAR(2)   NULL,
                    country_name  VARCHAR(60)  NULL,
                    city          VARCHAR(80)  NULL,
                    region        VARCHAR(80)  NULL,
                    first_seen    DATETIME     NULL,
                    last_seen     DATETIME     NOT NULL,
                    browser       VARCHAR(40)  NULL,
                    os            VARCHAR(40)  NULL,
                    utm_source    VARCHAR(100) NULL,
                    utm_medium    VARCHAR(100) NULL,
                    utm_campaign  VARCHAR(200) NULL,
                    screen        VARCHAR(20)  NULL,
                    lang          VARCHAR(20)  NULL,
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
            'browser      VARCHAR(40)  NULL',
            'os           VARCHAR(40)  NULL',
            'utm_source   VARCHAR(100) NULL',
            'utm_medium   VARCHAR(100) NULL',
            'utm_campaign VARCHAR(200) NULL',
            'screen       VARCHAR(20)  NULL',
            'lang         VARCHAR(20)  NULL',
        ] as $col) {
            try { $this->db->exec("ALTER TABLE online_sessions ADD COLUMN $col"); } catch (Exception $e) {}
        }
    }

    private function parseUA(string $ua): array
    {
        $browser = 'Outro';
        $os      = 'Outro';
        if (str_contains($ua, 'Edg/') || str_contains($ua, 'EdgA/'))       $browser = 'Edge';
        elseif (str_contains($ua, 'OPR/'))                                   $browser = 'Opera';
        elseif (str_contains($ua, 'SamsungBrowser'))                         $browser = 'Samsung';
        elseif (str_contains($ua, 'CriOS'))                                  $browser = 'Chrome';
        elseif (str_contains($ua, 'FxiOS'))                                  $browser = 'Firefox';
        elseif (str_contains($ua, 'Chrome') && !str_contains($ua, 'Chromium')) $browser = 'Chrome';
        elseif (str_contains($ua, 'Chromium'))                               $browser = 'Chromium';
        elseif (str_contains($ua, 'Firefox'))                                $browser = 'Firefox';
        elseif (str_contains($ua, 'Safari') && !str_contains($ua, 'Chrome')) $browser = 'Safari';
        elseif (str_contains($ua, 'MSIE') || str_contains($ua, 'Trident'))  $browser = 'IE';

        if (str_contains($ua, 'Windows NT'))   $os = 'Windows';
        elseif (str_contains($ua, 'iPhone'))   $os = 'iOS';
        elseif (str_contains($ua, 'iPad'))     $os = 'iPadOS';
        elseif (str_contains($ua, 'Mac OS X')) $os = 'macOS';
        elseif (str_contains($ua, 'Android'))  $os = 'Android';
        elseif (str_contains($ua, 'CrOS'))     $os = 'ChromeOS';
        elseif (str_contains($ua, 'Linux'))    $os = 'Linux';

        return ['browser' => $browser, 'os' => $os];
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
        ?string $page        = null,
        ?string $source      = null,
        ?string $referrer    = null,
        ?string $device      = null,
        string  $ip          = '',
        ?string $ua          = null,
        ?string $utmSource   = null,
        ?string $utmMedium   = null,
        ?string $utmCampaign = null,
        ?string $screen      = null,
        ?string $lang        = null
    ): void {
        $parsed = $ua ? $this->parseUA($ua) : ['browser' => null, 'os' => null];

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
                     country, country_name, city, region,
                     browser, os, utm_source, utm_medium, utm_campaign, screen, lang,
                     first_seen, last_seen)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())"
            );
            $stmt->execute([
                $sessionId, $userId, $page, $source, $referrer, $device, $ip ?: null,
                $geo['country']      ?? null,
                $geo['country_name'] ?? null,
                $geo['city']         ?? null,
                $geo['region']       ?? null,
                $parsed['browser'],  $parsed['os'],
                $utmSource, $utmMedium, $utmCampaign, $screen, $lang,
            ]);
        } else {
            $stmt = $this->db->prepare(
                "UPDATE online_sessions
                 SET user_id = ?, page = ?, source = ?, referrer = ?, device = ?,
                     browser = COALESCE(?, browser),
                     os      = COALESCE(?, os),
                     utm_source   = COALESCE(?, utm_source),
                     utm_medium   = COALESCE(?, utm_medium),
                     utm_campaign = COALESCE(?, utm_campaign),
                     screen = COALESCE(?, screen),
                     lang   = COALESCE(?, lang),
                     last_seen = NOW()
                 WHERE session_id = ?"
            );
            $stmt->execute([
                $userId, $page, $source, $referrer, $device,
                $parsed['browser'],  $parsed['os'],
                $utmSource, $utmMedium, $utmCampaign, $screen, $lang,
                $sessionId,
            ]);
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
        // Query principal — sem subquery correlacionada para máxima compatibilidade
        $stmt = $this->db->query(
            "SELECT os.session_id, os.user_id,
                    os.page, os.source, os.referrer, os.device,
                    os.ip, os.country, os.country_name, os.city, os.region,
                    os.browser, os.os, os.screen, os.lang,
                    os.utm_source, os.utm_medium, os.utm_campaign,
                    os.first_seen, os.last_seen,
                    TIMESTAMPDIFF(SECOND, os.last_seen,  NOW()) AS ago_seconds,
                    TIMESTAMPDIFF(SECOND, os.first_seen, NOW()) AS duration_seconds,
                    u.nome, u.email
             FROM online_sessions os
             LEFT JOIN users u ON os.user_id = u.id
             WHERE os.last_seen >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)
             ORDER BY os.last_seen DESC"
        );
        $sessions = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($sessions)) return [];

        // Busca eventos recentes de todas as sessões ativas em uma query só
        $sids        = array_column($sessions, 'session_id');
        $placeholders = implode(',', array_fill(0, count($sids), '?'));
        try {
            $evtStmt = $this->db->prepare(
                "SELECT session_id, type, label,
                        TIMESTAMPDIFF(SECOND, created_at, NOW()) AS ago_sec
                 FROM session_events
                 WHERE session_id IN ($placeholders)
                   AND created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)
                 ORDER BY created_at DESC"
            );
            $evtStmt->execute($sids);
            $allEvents = $evtStmt->fetchAll(PDO::FETCH_ASSOC);

            // Agrupa eventos por session_id (máx 5 por sessão)
            $evtMap = [];
            foreach ($allEvents as $e) {
                $sid = $e['session_id'];
                if (!isset($evtMap[$sid])) $evtMap[$sid] = [];
                if (count($evtMap[$sid]) < 5) {
                    $evtMap[$sid][] = $e['type'] . '|' . ($e['label'] ?? '') . '|' . $e['ago_sec'];
                }
            }
            foreach ($sessions as &$s) {
                $s['recent_events'] = isset($evtMap[$s['session_id']])
                    ? implode('~', $evtMap[$s['session_id']])
                    : null;
            }
            unset($s);
        } catch (\Throwable $e) {
            // Tabela session_events pode não existir — continua sem eventos
        }

        return $sessions;
    }
}
