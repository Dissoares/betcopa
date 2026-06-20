-- migration_v11: campos de perfil do usuário (telefone + chave PIX padrão)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telefone  VARCHAR(20)                                               NULL,
  ADD COLUMN IF NOT EXISTS tipo_pix  ENUM('cpf','cnpj','email','telefone','aleatoria')         NULL,
  ADD COLUMN IF NOT EXISTS chave_pix VARCHAR(255)                                              NULL;
