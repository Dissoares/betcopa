CREATE DATABASE IF NOT EXISTS betcopa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE betcopa;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bloqueado TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS jogos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  time_casa VARCHAR(100) NOT NULL,
  time_fora VARCHAR(100) NOT NULL,
  data_hora DATETIME NOT NULL,
  status ENUM('aberto','encerrado','finalizado') NOT NULL DEFAULT 'aberto',
  placar_real VARCHAR(20) DEFAULT NULL,
  odd DECIMAL(5,2) NOT NULL DEFAULT 1.80,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS apostas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  jogo_id INT NOT NULL,
  placar_casa TINYINT NOT NULL,
  placar_fora TINYINT NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  odd DECIMAL(5,2) NOT NULL,
  possivel_ganho DECIMAL(12,2) NOT NULL,
  status ENUM('pendente','pago','confirmado','perdido','ganhou') NOT NULL DEFAULT 'pendente',
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transacoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  tipo ENUM('credito','debito') NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  data DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

INSERT INTO jogos (time_casa, time_fora, data_hora, status, odd) VALUES
('Brasil', 'Argentina', DATE_ADD(NOW(), INTERVAL 1 DAY), 'aberto', 1.95),
('França', 'Alemanha', DATE_ADD(NOW(), INTERVAL 2 DAY), 'aberto', 2.10);
