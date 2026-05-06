-- ============================================================
-- Migration v5 — Gateways de pagamento + Saques
-- Executar: mysql -u root betcopa < sql/migration_v5.sql
-- ============================================================

-- Cobranças PIX (uma por aposta)
CREATE TABLE IF NOT EXISTS pagamentos (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    aposta_id           INT           NOT NULL,
    gateway             VARCHAR(50)   NOT NULL DEFAULT 'simulado',
    gateway_payment_id  VARCHAR(255)  NOT NULL DEFAULT '',
    qr_code             TEXT,
    qr_code_base64      MEDIUMTEXT,
    valor               DECIMAL(10,2) NOT NULL,
    status              ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
    expires_at          DATETIME      NULL,
    criado_em           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (aposta_id) REFERENCES apostas(id) ON DELETE CASCADE,
    INDEX idx_gpid    (gateway_payment_id),
    INDEX idx_aposta  (aposta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pedidos de saque
CREATE TABLE IF NOT EXISTS saques (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT           NOT NULL,
    valor         DECIMAL(10,2) NOT NULL,
    chave_pix     VARCHAR(255)  NOT NULL,
    tipo_pix      ENUM('cpf','cnpj','email','telefone','aleatoria') NOT NULL,
    status        ENUM('pendente','aprovado','rejeitado') NOT NULL DEFAULT 'pendente',
    criado_em     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processado_em DATETIME      NULL,
    obs           TEXT          NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user   (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Novas configs (não sobrescreve se já existir)
INSERT INTO configuracoes (chave, valor, descricao) VALUES
    ('gateway_ativo',     'simulado', 'Gateway ativo: simulado | mercadopago')
    ON DUPLICATE KEY UPDATE descricao = VALUES(descricao);

INSERT INTO configuracoes (chave, valor, descricao) VALUES
    ('mp_access_token',   '', 'Mercado Pago Access Token (produção ou sandbox)')
    ON DUPLICATE KEY UPDATE descricao = VALUES(descricao);

INSERT INTO configuracoes (chave, valor, descricao) VALUES
    ('mp_webhook_secret', '', 'Mercado Pago webhook secret para validação HMAC-SHA256')
    ON DUPLICATE KEY UPDATE descricao = VALUES(descricao);

INSERT INTO configuracoes (chave, valor, descricao) VALUES
    ('saques_ativos',     '1', '1 = saques habilitados | 0 = desabilitados')
    ON DUPLICATE KEY UPDATE descricao = VALUES(descricao);
