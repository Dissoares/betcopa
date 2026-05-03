ALTER TABLE jogos
  ADD COLUMN bandeira_casa VARCHAR(10) NOT NULL DEFAULT '⚽' AFTER time_fora,
  ADD COLUMN bandeira_fora VARCHAR(10) NOT NULL DEFAULT '⚽' AFTER bandeira_casa,
  ADD COLUMN valor_base DECIMAL(5,2) NOT NULL DEFAULT 1.00 AFTER odd;

-- Atualiza dados de exemplo com bandeiras
UPDATE jogos SET bandeira_casa = '🇧🇷', bandeira_fora = '🇦🇷' WHERE time_casa = 'Brasil' AND time_fora = 'Argentina';
UPDATE jogos SET bandeira_casa = '🇫🇷', bandeira_fora = '🇩🇪' WHERE time_casa = 'França' AND time_fora = 'Alemanha';
