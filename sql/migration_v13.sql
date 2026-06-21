-- migration_v13: magic links para retenção + remember token
CREATE TABLE IF NOT EXISTS magic_tokens (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  token      VARCHAR(64)  NOT NULL,
  email      VARCHAR(255) NOT NULL,
  user_id    INT          NOT NULL,
  used       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_token (token),
  KEY idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE users ADD COLUMN remember_token VARCHAR(64) NULL;
