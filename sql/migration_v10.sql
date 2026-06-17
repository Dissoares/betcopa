-- migration_v10: rastreamento de eventos por sessão
CREATE TABLE IF NOT EXISTS session_events (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(36)  NOT NULL,
  event_type VARCHAR(40)  NOT NULL,
  label      VARCHAR(200) NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT NOW(),
  INDEX idx_se_sid (session_id),
  INDEX idx_se_ts  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
