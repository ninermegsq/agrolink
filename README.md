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

1. No Supabase, abra **Settings → Database → Connection string → URI (PostgreSQL)**.
2. Cole a string em `DATABASE_URL` no `.env`.
3. Crie o schema:

```bash
pnpm db:generate   # gera as migrações a partir de drizzle/schema.ts
pnpm db:migrate   # aplica as migrações no banco
```

Comandos auxiliares: `pnpm db:push` (gera e aplica de uma vez) e `pnpm db:studio`
(abre o Drizzle Studio para inspecionar os dados).

> **Conexão direta vs. pooler.** O Supabase oferece duas URLs: a direta (porta
> `5432`) e o *pooler de transações* (porta `6543`, ou a mesma URL com
> `?pgbouncer=true`). Use a **direta** para rodar `pnpm db:migrate` e o
> **pooler** para a aplicação em produção. O driver detecta o pooler pela porta
> e desliga *prepared statements* automaticamente — sem isso, as consultas
> falham com `prepared statement does not exist`. O TLS é definido pelo
> parâmetro `?sslmode=require` da própria URL.

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
pnpm check   # tsc --noEmit
pnpm test    # vitest run
pnpm format  # prettier --write .
pnpm smoke   # sobe o build e verifica /api/health, a home, /login, o tRPC e o logo
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
