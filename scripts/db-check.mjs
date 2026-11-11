#!/usr/bin/env node
/**
 * Verificacao da conexao com o banco do AGROLINK (somente leitura).
 *
 * Confere a URL do `.env`, abre a conexao, valida o schema aplicado (tabelas,
 * RLS e indices) e compara o registro de migracoes do Drizzle com o journal
 * do projeto. Nao escreve nada no banco.
 *
 * Uso: pnpm db:check
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import postgres from "postgres";

const root = process.cwd();
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("[db:check] DATABASE_URL nao definida. Configure o arquivo .env (veja env.example).");
  process.exit(1);
}

function buildClientOptions(connectionString) {
  const options = { max: 1, onnotice: () => {} };
  try {
    const parsed = new URL(connectionString);
    const usesPooler = parsed.port === "6543" || parsed.searchParams.get("pgbouncer") === "true";
    if (usesPooler) options.prepare = false;
  } catch {
    // URL fora do formato padrao: mantem as opcoes basicas.
  }
  return options;
}

function maskUrl(connectionString) {
  return connectionString.replace(/\/\/([^:]+):[^@]*@/, "//$1:***@");
}

const sql = postgres(url, buildClientOptions(url));
const failures = [];
function check(name, ok, detail = "") {
  if (!ok) failures.push(name);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

try {
  console.log(`[db:check] url: ${maskUrl(url)}`);

  const [session] = await sql`select current_user as usr, current_database() as db`;
  check("conexao estabelecida", Boolean(session?.usr), `${session?.usr}@${session?.db}`);

  const [tables] = await sql`
    select count(*)::int as total,
           count(*) filter (where c.relrowsecurity)::int as com_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  `;
  check("schema public com 22 tabelas", tables.total === 22, `${tables.total} tabelas`);
  check("RLS habilitado em todas as tabelas", tables.com_rls === tables.total, `${tables.com_rls}/${tables.total}`);

  const [policies] = await sql`select count(*)::int as total from pg_policies where schemaname = 'public'`;
  check("politicas RLS criadas", policies.total >= 22, `${policies.total} politicas`);

  const journalPath = path.join(root, "drizzle", "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  let pending = 0;
  for (const entry of journal.entries) {
    const sqlText = fs.readFileSync(path.join(root, "drizzle", `${entry.tag}.sql`), "utf8");
    const hash = crypto.createHash("sha256").update(sqlText).digest("hex");
    const [row] = await sql`select hash from drizzle.__drizzle_migrations where created_at = ${entry.when} limit 1`;
    if (!row) {
      pending += 1;
      console.log(`     migracao pendente no banco: ${entry.tag}`);
    } else if (row.hash !== hash) {
      pending += 1;
      console.log(`     migracao com hash divergente: ${entry.tag}`);
    }
  }
  check("migracoes do drizzle aplicadas", pending === 0, pending === 0 ? "todas registradas" : `${pending} pendente(s)`);

  const [roles] = await sql`
    select r.rolname
    from pg_roles r
    where r.rolname = current_user
  `;
  check("papel de conexao sem BYPASSRLS", roles.rolname !== "postgres", `papel: ${roles.rolname}`);

  console.log(`\n[db:check] ${failures.length === 0 ? "tudo certo" : `${failures.length} verificacao(oes) falharam`}`);
  await sql.end();
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.error("[db:check] falha:", error instanceof Error ? error.message : error);
  try { await sql.end({ timeout: 1 }); } catch {}
  process.exit(1);
}
