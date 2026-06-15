<?php
class AnalyticsRepository
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
        $this->initTable();
    }

    private function initTable(): void
    {
        try {
            $this->db->exec("
                CREATE TABLE IF NOT EXISTS analytics_visits (
                    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    session_id   VARCHAR(36)   NOT NULL,
                    visit_date   DATE          NOT NULL,
                    user_id      INT           NULL,
                    ip           VARCHAR(45)   NULL,
                    country      VARCHAR(2)    NULL,
                    country_name VARCHAR(60)   NULL,
                    city         VARCHAR(80)   NULL,
                    region       VARCHAR(80)   NULL,
                    browser      VARCHAR(40)   NULL,
                    os           VARCHAR(40)   NULL,
                    device       VARCHAR(10)   NULL,
                    source       VARCHAR(50)   NULL,
                    referrer     VARCHAR(500)  NULL,
                    landing_page VARCHAR(150)  NULL,
                    current_page VARCHAR(150)  NULL,
                    page_views   INT           NOT NULL DEFAULT 1,
                    is_new       TINYINT(1)    NOT NULL DEFAULT 1,
                    first_seen   DATETIME      NOT NULL,
                    last_seen    DATETIME      NOT NULL,
                    PRIMARY KEY  (id),
                    UNIQUE KEY   uniq_session_day (session_id, visit_date),
                    KEY          idx_date    (visit_date),
                    KEY          idx_ip      (ip),
                    KEY          idx_country (country),
                    KEY          idx_source  (source)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
        } catch (Exception $e) {}
    }

    // ── Geo-IP via ip-api.com (chamado só em sessões novas) ───────
    private function geoLookup(string $ip): array
    {
        if (!$ip) return [];
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

    // ── Browser + OS detection a partir do User-Agent ─────────────
    private function parseUA(string $ua): array
    {
        $browser = 'Outro';
        $os      = 'Outro';

        // Browser (ordem importa — checar mais específicos primeiro)
        if (str_contains($ua, 'Edg/') || str_contains($ua, 'EdgA/'))  $browser = 'Edge';
        elseif (str_contains($ua, 'OPR/'))                              $browser = 'Opera';
        elseif (str_contains($ua, 'SamsungBrowser'))                    $browser = 'Samsung';
        elseif (str_contains($ua, 'CriOS'))                             $browser = 'Chrome';
        elseif (str_contains($ua, 'FxiOS'))                             $browser = 'Firefox';
        elseif (str_contains($ua, 'Chrome') && !str_contains($ua, 'Chromium')) $browser = 'Chrome';
        elseif (str_contains($ua, 'Chromium'))                          $browser = 'Chromium';
        elseif (str_contains($ua, 'Firefox'))                           $browser = 'Firefox';
        elseif (str_contains($ua, 'Safari') && !str_contains($ua, 'Chrome')) $browser = 'Safari';
        elseif (str_contains($ua, 'MSIE') || str_contains($ua, 'Trident')) $browser = 'IE';

        // OS
        if (str_contains($ua, 'Windows NT'))    $os = 'Windows';
        elseif (str_contains($ua, 'iPhone'))    $os = 'iOS';
        elseif (str_contains($ua, 'iPad'))      $os = 'iPadOS';
        elseif (str_contains($ua, 'Mac OS X'))  $os = 'macOS';
        elseif (str_contains($ua, 'Android'))   $os = 'Android';
        elseif (str_contains($ua, 'CrOS'))      $os = 'ChromeOS';
        elseif (str_contains($ua, 'Linux'))     $os = 'Linux';

        return ['browser' => $browser, 'os' => $os];
    }

    // ── Grava/atualiza visita ──────────────────────────────────────
    public function record(
        string  $sessionId,
        ?int    $userId,
        string  $ip,
        string  $ua,
        ?string $page,
        ?string $source,
        ?string $referrer,
        ?string $device
    ): void {
        $parsed = $this->parseUA($ua);

        $chk = $this->db->prepare(
            "SELECT id FROM analytics_visits WHERE session_id = ? AND visit_date = CURDATE() LIMIT 1"
        );
        $chk->execute([$sessionId]);
        $existing = $chk->fetch(PDO::FETCH_ASSOC);

        if (!$existing) {
            // Verifica se é visitante novo ou retornando
            $retChk = $this->db->prepare(
                "SELECT 1 FROM analytics_visits WHERE ip = ? AND visit_date < CURDATE() LIMIT 1"
            );
            $retChk->execute([$ip ?: null]);
            $isNew = $retChk->fetch() ? 0 : 1;

            $geo  = $this->geoLookup($ip);
            $stmt = $this->db->prepare("
                INSERT INTO analytics_visits
                    (session_id, visit_date, user_id, ip,
                     country, country_name, city, region,
                     browser, os, device,
                     source, referrer,
                     landing_page, current_page,
                     page_views, is_new, first_seen, last_seen)
                VALUES
                    (?, CURDATE(), ?, ?,
                     ?, ?, ?, ?,
                     ?, ?, ?,
                     ?, ?,
                     ?, ?,
                     1, ?, NOW(), NOW())
            ");
            $stmt->execute([
                $sessionId, $userId, $ip ?: null,
                $geo['country'] ?? null, $geo['country_name'] ?? null,
                $geo['city']    ?? null, $geo['region']       ?? null,
                $parsed['browser'], $parsed['os'], $device,
                $source, $referrer,
                $page, $page,
                $isNew,
            ]);
        } else {
            // Atualiza página atual e incrementa contador de páginas
            $stmt = $this->db->prepare("
                UPDATE analytics_visits
                SET user_id      = COALESCE(?, user_id),
                    current_page = ?,
                    page_views   = page_views + 1,
                    last_seen    = NOW()
                WHERE session_id = ? AND visit_date = CURDATE()
            ");
            $stmt->execute([$userId, $page, $sessionId]);
        }
    }

    // ── Helpers de período ────────────────────────────────────────
    private function periodWhere(string $period): string
    {
        return match ($period) {
            'week'  => "visit_date >= DATE_SUB(CURDATE(), INTERVAL 6  DAY)",
            'month' => "visit_date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)",
            default => "visit_date = CURDATE()",
        };
    }

    // ── Stats resumo ──────────────────────────────────────────────
    public function getStats(string $period): array
    {
        $w    = $this->periodWhere($period);
        $stmt = $this->db->query("
            SELECT
                COUNT(*)               AS total_visits,
                COUNT(DISTINCT ip)     AS unique_ips,
                SUM(is_new = 1)        AS novos,
                SUM(is_new = 0)        AS retornaram,
                SUM(page_views)        AS total_pageviews,
                ROUND(AVG(TIMESTAMPDIFF(SECOND, first_seen, last_seen) / 60), 1) AS avg_duration_min
            FROM analytics_visits WHERE $w
        ");
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    }

    // ── Agrupamentos para mini charts ─────────────────────────────
    public function getBySource(string $period): array
    {
        $w = $this->periodWhere($period);
        $stmt = $this->db->query("
            SELECT COALESCE(source,'direto') AS source, COUNT(*) AS cnt
            FROM analytics_visits WHERE $w
            GROUP BY source ORDER BY cnt DESC LIMIT 12
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getByCountry(string $period): array
    {
        $w = $this->periodWhere($period);
        $stmt = $this->db->query("
            SELECT country, country_name, COUNT(*) AS cnt
            FROM analytics_visits WHERE $w AND country IS NOT NULL AND country != ''
            GROUP BY country, country_name ORDER BY cnt DESC LIMIT 15
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getByDevice(string $period): array
    {
        $w = $this->periodWhere($period);
        $stmt = $this->db->query("
            SELECT COALESCE(device,'desktop') AS device, COUNT(*) AS cnt
            FROM analytics_visits WHERE $w
            GROUP BY device ORDER BY cnt DESC
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getByBrowser(string $period): array
    {
        $w = $this->periodWhere($period);
        $stmt = $this->db->query("
            SELECT COALESCE(browser,'Outro') AS browser, COUNT(*) AS cnt
            FROM analytics_visits WHERE $w
            GROUP BY browser ORDER BY cnt DESC LIMIT 8
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getByOS(string $period): array
    {
        $w = $this->periodWhere($period);
        $stmt = $this->db->query("
            SELECT COALESCE(os,'Outro') AS os, COUNT(*) AS cnt
            FROM analytics_visits WHERE $w
            GROUP BY os ORDER BY cnt DESC LIMIT 8
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getByPage(string $period): array
    {
        $w = $this->periodWhere($period);
        $stmt = $this->db->query("
            SELECT COALESCE(current_page,'Início') AS page, COUNT(*) AS cnt
            FROM analytics_visits WHERE $w
            GROUP BY current_page ORDER BY cnt DESC LIMIT 10
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // ── Lista de visitas paginada ─────────────────────────────────
    public function getVisits(string $period, int $page = 1, int $limit = 50): array
    {
        $w      = $this->periodWhere($period);
        $offset = ($page - 1) * $limit;
        $stmt   = $this->db->query("
            SELECT
                av.*,
                u.nome, u.email,
                TIMESTAMPDIFF(SECOND, av.first_seen, av.last_seen)  AS duration_sec,
                (SELECT COUNT(*) FROM analytics_visits av2
                 WHERE av2.ip = av.ip) AS ip_total_visits
            FROM analytics_visits av
            LEFT JOIN users u ON av.user_id = u.id
            WHERE $w
            ORDER BY av.last_seen DESC
            LIMIT {$limit} OFFSET {$offset}
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function countVisits(string $period): int
    {
        $w    = $this->periodWhere($period);
        $stmt = $this->db->query("SELECT COUNT(*) FROM analytics_visits WHERE $w");
        return (int) $stmt->fetchColumn();
    }
}
