# AGROLINK — CRM e catálogo de contatos do agronegócio

Plataforma web para organizar contatos do agro: base central conferida pela
administração, contatos particulares da organização, importação de planilhas
(XLSX/CSV), modelos de mensagem e abertura de conversa pelo WhatsApp.

- **Stack:** Vite 7 + React 19 (SPA) · Express 4 + tRPC v11 (API) · Drizzle ORM 0.44 sobre PostgreSQL
- **Banco:** PostgreSQL (Supabase) — o schema já usa `drizzle-orm/pg-core`
- **Autenticação:** login local por e-mail e senha (hash `scrypt`) com cookie de sessão JWT (HS256)

---

## 1. Pré-requisitos

| Item | Versão |
| --- | --- |
| Node.js | 20 ou superior |
| pnpm | 10.18 (`corepack enable`) |
| PostgreSQL | 15 ou superior — ou um projeto Supabase |

## 2. Instalação

```bash
pnpm install
```

## 3. Variáveis de ambiente

```bash
cp env.example .env
```

Preencha no `.env`:

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | sim | String de conexão PostgreSQL do Supabase (`postgresql://usuario:senha@host:5432/postgres`) |
| `SESSION_SECRET` | sim | Segredo que assina o cookie de sessão (JWT HS256). Gere com `openssl rand -base64 32` |
| `COOKIE_SECURE` | não | `true` exige HTTPS no cookie. Use `false` em `http://localhost` |
| `APP_URL` | não | URL pública da aplicação |
| `APP_ID` | não | Identificador da aplicação |
| `ADMIN_EMAILS` | não | E-mails (separados por vírgula) que recebem o papel de administrador no primeiro acesso |
| `PORT` | não | Porta do servidor (padrão `3000`) |

> O arquivo `.env` está no `.gitignore` e nunca deve ser versionado.

## 4. Banco de dados (Supabase)

O projeto já está ligado ao Supabase **`jjjeempjwjjrnvkvgbjb`** (*agrolink*) e o
schema completo está aplicado: **19 enums, 22 tabelas e 28 índices** (52 no
total, contando as chaves primárias e as unicidades), com **RLS habilitado em
todas as tabelas**.

### O que já está configurado

| Item | Estado |
| --- | --- |
| Schema `public` | 22 tabelas (`users`, `organizations`, `contacts`, `catalogContacts`, `imports`, `tasks`, …) |
| Row Level Security | Ativado nas 22 tabelas |
| Políticas RLS | 44 políticas: `agrolink_app` (aplicação) e `service_role`. `anon` e `authenticated` **não têm política nenhuma** — com RLS ativo o acesso é negado por padrão, então o PostgREST devolve zero linhas. O front-end não conversa direto com o Supabase, tudo passa pela API |
| Papel da aplicação | `agrolink_app` — `LOGIN`, **sem** superusuário e **sem** `BYPASSRLS`; o acesso vem das políticas RLS |
| Registro de migrações | `drizzle.__drizzle_migrations` com a migração `0000_tiresome_nick_fury` |

### String de conexão

O `.env` local já vem preenchido com:

```
DATABASE_URL=postgresql://agrolink_app:SENHA@db.jjjeempjwjjrnvkvgbjb.supabase.co:5432/postgres?sslmode=require
```

> **Por que a conexão direta e não o pooler?** O *pooler de transações* do
> Supabase (porta `6543`) só aceita o usuário `postgres.<ref>`. Como a
> aplicação usa o papel dedicado `agrolink_app`, ela usa a **conexão direta**
> (porta `5432`). O driver continua detectando o pooler automaticamente pela
> porta `6543` (ou por `?pgbouncer=true`) e desligando *prepared statements*
> quando ele for usado — necessário porque o pooler não aceita statements
> preparados. O TLS é definido pelo parâmetro `?sslmode=require` da própria URL.

### Para configurar outro projeto

1. No Supabase, abra **Settings → Database → Connection string → URI (PostgreSQL)**.
2. Crie um papel para a aplicação (sem superusuário) e registre as permissões:

```sql
CREATE ROLE agrolink_app LOGIN PASSWORD 'SENHA-FORTE' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
GRANT USAGE ON SCHEMA public TO agrolink_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO agrolink_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO agrolink_app;
```

3. Aplique o schema e as políticas:

```bash
pnpm db:migrate   # aplica drizzle/0000_tiresome_nick_fury.sql
pnpm db:check     # confere tabelas, RLS, políticas e o registro de migrações
```

Comandos auxiliares: `pnpm db:generate` (gera migrações a partir de
`drizzle/schema.ts`), `pnpm db:push` (gera e aplica de uma vez), `pnpm db:hash`
(imprime o hash das migrações, útil quando elas são aplicadas pelo painel do
Supabase) e `pnpm db:studio` (abre o Drizzle Studio para inspecionar os dados).

Ao criar a primeira conta pela tela `/login`, o AGROLINK provisiona
automaticamente a organização, as categorias, as tags, o modelo de mensagem
padrão e a assinatura do usuário — um banco Supabase recém-criado já funciona
sem configuração extra.

## 5. Executando

```bash
pnpm dev       # servidor de desenvolvimento (Vite + API na mesma porta)
pnpm build     # gera dist/public (front) e dist/index.js (API)
pnpm start     # serve o build de produção
pnpm preview   # alias de pnpm start
```

A aplicação fica em `http://localhost:3000` por padrão.

- `GET /api/health` responde `{ "status": "ok", "service": "agrolink" }`.
- O painel exige autenticação: em `/login` use **Entrar** (conta existente) ou
  **Criar conta**. O primeiro usuário cadastrado no banco recebe o papel de
  administrador; convites feitos pela tela *Administração da base* são
  assumidos pelo mesmo e-mail no primeiro acesso.

## 6. Qualidade

```bash
pnpm check     # tsc --noEmit
pnpm test      # vitest run
pnpm format    # prettier --write .
pnpm smoke     # sobe o build e verifica /api/health, a home, /login, o tRPC e o logo
pnpm db:check  # confere a conexao com o Supabase, o schema, o RLS e as migrações
```

O GitHub Actions executa `check`, `test` e `build` em cada push
(`.github/workflows/ci.yml`).

## 7. Estrutura

```
client/          SPA (React + Vite + Tailwind v4 + shadcn/ui)
  src/pages/     Home, Login, AppDashboard, Legal, NotFound
  src/components/ui/  componentes base
server/          API Express + tRPC
  _core/         bootstrap, contexto, sessão, cookies, env
  db.ts          acesso ao banco (Drizzle)
  routers.ts     procedures tRPC (auth, organization, catalog, contacts, ...)
  catalog.ts     base central administrada
  actions.ts     ações de escrita do painel
shared/          código compartilhado (constantes, importador de planilhas)
drizzle/         schema e migrações
scripts/         utilitários de desenvolvimento
```

## 8. Publicar no GitHub

O projeto já é um repositório git válido (`.gitignore`, `LICENSE` MIT e
metadados em `package.json`). Para enviar ao GitHub:

```bash
git remote add origin https://github.com/<usuario>/<repositorio>.git
git push -u origin main
```

Se o push for rejeitado por histórico remoto divergente, use
`git pull --rebase origin main` (ou `git push --force-with-lease` apenas quando
for realmente intencional).

## 9. Licença

MIT — veja [LICENSE](./LICENSE).
