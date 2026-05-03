USE betcopa;

SET @has_bloqueado = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'bloqueado'
);

SET @sql = IF(@has_bloqueado = 0,
  'ALTER TABLE users ADD COLUMN bloqueado TINYINT(1) NOT NULL DEFAULT 0 AFTER criado_em;',
  'SELECT 1;'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS configuracoes (
  chave VARCHAR(100) PRIMARY KEY,
  valor TEXT NOT NULL,
  descricao VARCHAR(255) DEFAULT NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO configuracoes (chave, valor, descricao) VALUES
  ('site_nome',         'BetCopa',             'Nome exibido na plataforma'),
  ('site_emoji',        '⚽',                  'Emoji/ícone do logo'),
  ('pix_tipo',          'email',               'Tipo da chave PIX'),
  ('pix_chave',         '',                    'Chave PIX para recebimento'),
  ('pix_nome',          '',                    'Nome do beneficiário PIX'),
  ('bonus_cadastro',    '100.00',              'Crédito inicial ao criar conta'),
  ('valor_base_padrao', '1.00',                'Valor base padrão para novos jogos'),
  ('mult_min',          '2',                   'Multiplicador mínimo do slider'),
  ('mult_max',          '10',                  'Multiplicador máximo do slider'),
  ('max_aposta',        '500.00',              'Valor máximo por aposta (R$)'),
  ('max_ganho',         '5000.00',             'Ganho máximo por aposta (R$)'),
  ('admin_email',       'admin@betcopa.local', 'Email do administrador'),
  ('saques_ativos',     '1',                   '1 = saques habilitados, 0 = desabilitados')
ON DUPLICATE KEY UPDATE valor = VALUES(valor);