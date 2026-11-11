/**
 * Lista as migracoes do Drizzle com o hash que o drizzle-kit registra em
 * `drizzle.__drizzle_migrations`.
 *
 * Use este script quando uma migracao for aplicada pelo painel/API do Supabase
 * (e nao pelo `pnpm db:migrate`): o hash impresso e o valor que precisa ser
 * inserido na tabela de controle para que o proximo `pnpm db:migrate` nao tente
 * reaplicar a mesma migracao.
 *
 * Uso: pnpm db:hash
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const journalPath = path.join(root, "drizzle", "meta", "_journal.json");

if (!fs.existsSync(journalPath)) {
  console.error("[db:hash] drizzle/meta/_journal.json nao encontrado.");
  process.exit(1);
}

const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
console.log(`[db:hash] ${journal.entries.length} migracao(oes) no journal`);

for (const entry of journal.entries) {
  const sqlPath = path.join(root, "drizzle", `${entry.tag}.sql`);
  if (!fs.existsSync(sqlPath)) {
    console.error(`[db:hash] arquivo ausente: ${path.relative(root, sqlPath)}`);
    continue;
  }
  const sql = fs.readFileSync(sqlPath, "utf8");
  const hash = crypto.createHash("sha256").update(sql).digest("hex");
  console.log("");
  console.log(`tag:        ${entry.tag}`);
  console.log(`created_at: ${entry.when}`);
  console.log(`hash:       ${hash}`);
  console.log(
    `insert:     INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${entry.when});`,
  );
}
