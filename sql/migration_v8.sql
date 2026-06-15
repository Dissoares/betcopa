-- migration_v8: tabela de depósitos via PIX
CREATE TABLE IF NOT EXISTS deposits (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    user_id            INT            NOT NULL,
    valor              DECIMAL(10,2)  NOT NULL,
    status             ENUM('pendente','pago','confirmado','cancelado','rejected') DEFAULT 'pendente',
    gateway            VARCHAR(50)    DEFAULT '',
    gateway_payment_id VARCHAR(200)   DEFAULT '',
    qr_code            TEXT,
    qr_code_base64     TEXT,
    expires_at         DATETIME       NULL,
    criado_em          DATETIME       DEFAULT CURRENT_TIMESTAMP,
    atualizado_em      DATETIME       NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
