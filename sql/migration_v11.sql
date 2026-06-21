-- migration_v11: campos de perfil do usuário (telefone + chave PIX padrão)
ALTER TABLE users
  ADD COLUMN telefone  VARCHAR(20)                                               NULL,
  ADD COLUMN tipo_pix  ENUM('cpf','cnpj','email','telefone','aleatoria')         NULL,
  ADD COLUMN chave_pix VARCHAR(255)                                              NULL;
