-- Referral system
ALTER TABLE users
  ADD COLUMN referral_code VARCHAR(20) NULL UNIQUE AFTER email,
  ADD COLUMN referred_by   INT NULL AFTER referral_code;

-- Generate codes for existing users
UPDATE users
SET referral_code = UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 8))
WHERE referral_code IS NULL;

-- Bonus per referral (admin can change via painel)
INSERT IGNORE INTO configuracoes (chave, valor) VALUES ('bonus_indicacao', '10.00');
