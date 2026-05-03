# BetCopa

Sistema web de apostas em placares de futebol com backend em PHP puro (PDO) e frontend leve em JavaScript moderno + SCSS.

## Estrutura

- `public/` - ponto de entrada e recursos públicos
- `src/` - camadas backend (controllers, services, repositories, utils)
- `assets/` - front-end JS e estilos SCSS/CSS
- `sql/schema.sql` - script de criação do banco de dados
- `logs/` - logs de operações críticas

## Requisitos

- PHP 8+
- MySQL/MariaDB
- Hospedagem compartilhada compatível com PHP + PDO

## Instalação

1. Atualize `src/config.php` com as credenciais do MySQL
2. Acesse `public/install.php` no navegador para criar o banco e as tabelas automaticamente
3. Acesse `public/` no navegador

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
- `POST /api/admin/jogos/{id}/resultado`

## Fluxo básico

1. Cadastro/Login
2. Escolher jogo e fazer aposta antes do horário
3. Simular pagamento PIX
4. Atualizar placar real no admin
5. Ver resultado e ranking
