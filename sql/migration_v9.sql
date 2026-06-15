-- migration_v9: suporte a múltiplos admins
ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0;
