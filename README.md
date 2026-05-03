# BetCopa

Sistema web de apostas em placares de futebol com backend em PHP puro (PDO) e frontend leve em JavaScript moderno + SCSS.

## Estrutura

- `public/` - ponto de entrada e recursos públicos
- `src/` - camadas backend (controllers, services, repositories, utils)
- `assets/` - front-end JS e estilos SCSS/CSS
- `public/assets/` - cópia dos assets servidos ao navegador
- `sql/schema.sql` - script de criação do banco de dados
- `sql/fix_config.sql` - correções de schema e configurações adicionais
- `logs/` - logs de operações críticas

## Requisitos

- PHP 8+
- MySQL/MariaDB
- Apache com mod_rewrite ou equivalente
- Hospedagem compartilhada compatível com PHP + PDO

## Instalação

1. Configure as credenciais do banco em `src/config.php`
2. Acesse `public/install.php` no navegador para criar o banco, tabelas e configurações iniciais automaticamente
3. Abra `public/` no navegador para usar o sistema
4. Se o CSS não carregar, limpe o cache do navegador e recarregue com `Ctrl+F5`

## Configuração

### Banco de dados

- O script `sql/schema.sql` cria as tabelas necessárias
- `sql/fix_config.sql` corrige e adiciona campos de configuração caso o banco já exista

### Admin

- O usuário admin é identificado pelo email configurado em `admin_email`
- Use `admin@betcopa.local` como valor inicial em `src/config.php`
- No painel admin, configure:
  - `admin_email`
  - `api_football_key`
  - `api_football_timezone`
  - dados PIX
  - bônus de cadastro
  - limites de aposta e ganho
  - valores de multiplicador
  - status de saques

### API-Football

- Configure a chave em `src/config.php` ou no painel admin em Configurações
- A API é usada para importar jogos e sincronizar resultados
- Se você não tiver chave ainda, crie uma conta gratuita em `api-sports.io`

## Uso do painel admin

1. Faça login com um usuário cujo email seja o `admin_email`
2. Acesse a aba `Admin`
3. Use `Importar Jogos` para trazer fixtures da API
4. Use `Sincronizar Resultados` para atualizar placares e processar apostas encerradas
5. Use `Configurações` para ajustar limites e valores sem editar código

## Endpoints API

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/jogos`
- `POST /api/apostas`
- `POST /api/apostas/{id}/pagar`
- `POST /api/apostas/{id}/confirmar`
- `GET /api/apostas`
- `GET /api/ranking`
- `POST /api/admin/jogos`
- `POST /api/admin/import`
- `POST /api/admin/sync`
- `POST /api/admin/jogos/{id}/resultado`
- `GET /api/admin/config`
- `POST /api/admin/config`

## Fluxo básico

1. Cadastro/Login
2. Escolher jogo e fazer aposta antes do horário
3. Simular pagamento PIX
4. Atualizar resultado no admin ou usar sync de API
5. Ver ranking e pagamentos automáticos

## Observações

- O backend usa `password_hash` e prepared statements via PDO
- O saldo do usuário é computado por transações, não por alteração direta de campo
- O frontend usa JSON para comunicação e não depende de bibliotecas pesadas
