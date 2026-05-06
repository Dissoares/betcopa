-- Recuperação de senha
CREATE TABLE IF NOT EXISTS password_resets (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT          NOT NULL,
    token      VARCHAR(64)  NOT NULL UNIQUE,
    expires_at DATETIME     NOT NULL,
    usado      TINYINT(1)   NOT NULL DEFAULT 0,
    criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Configurações de e-mail (inserir apenas se não existirem)
INSERT IGNORE INTO configuracoes (chave, valor, descricao) VALUES
  ('mail_enabled',   '0',                    'Habilitar envio de e-mails (0=desabilitado)'),
  ('mail_from',      'noreply@betcopa.local', 'E-mail remetente'),
  ('mail_from_name', 'BetCopa',              'Nome do remetente');
