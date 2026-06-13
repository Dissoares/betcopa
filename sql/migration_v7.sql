-- Performance indexes para queries admin e listagens públicas

CREATE INDEX IF NOT EXISTS idx_apostas_status      ON apostas (status);
CREATE INDEX IF NOT EXISTS idx_apostas_criado_em   ON apostas (criado_em);
CREATE INDEX IF NOT EXISTS idx_apostas_status_data ON apostas (status, criado_em);
CREATE INDEX IF NOT EXISTS idx_apostas_jogo_status ON apostas (jogo_id, status);
CREATE INDEX IF NOT EXISTS idx_apostas_user_data   ON apostas (user_id, criado_em);

CREATE INDEX IF NOT EXISTS idx_jogos_status      ON jogos (status);
CREATE INDEX IF NOT EXISTS idx_jogos_data_hora   ON jogos (data_hora);
CREATE INDEX IF NOT EXISTS idx_jogos_status_data ON jogos (status, data_hora);

CREATE INDEX IF NOT EXISTS idx_users_criado_em ON users (criado_em);
CREATE INDEX IF NOT EXISTS idx_users_bloqueado ON users (bloqueado);

CREATE INDEX IF NOT EXISTS idx_trans_user_tipo ON transacoes (user_id, tipo);
