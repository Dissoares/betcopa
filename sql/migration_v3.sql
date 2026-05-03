ALTER TABLE jogos
  ADD COLUMN api_fixture_id INT          DEFAULT NULL AFTER id,
  ADD COLUMN liga_nome      VARCHAR(100) DEFAULT NULL AFTER status,
  ADD COLUMN liga_logo      VARCHAR(255) DEFAULT NULL AFTER liga_nome,
  ADD COLUMN estadio        VARCHAR(150) DEFAULT NULL AFTER liga_logo,
  ADD COLUMN rodada         VARCHAR(80)  DEFAULT NULL AFTER estadio,
  ADD COLUMN logo_casa      VARCHAR(255) DEFAULT NULL AFTER bandeira_fora,
  ADD COLUMN logo_fora      VARCHAR(255) DEFAULT NULL AFTER logo_casa,
  ADD COLUMN status_api     VARCHAR(10)  DEFAULT 'NS' AFTER logo_fora;

ALTER TABLE jogos ADD UNIQUE INDEX idx_api_fixture_id (api_fixture_id);
