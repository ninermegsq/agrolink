#!/usr/bin/env node
/**
 * Teste de fumaca do build de producao.
 *
 * Sobe `dist/index.js` em uma porta livre, valida a API e o front servido
 * pelo proprio Express e encerra o processo. Nao acessa banco de dados:
 * os endpoints exercitados sao publicos.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "dist", "index.js");

if (!existsSync(entry)) {
  console.error("[smoke] build ausente: rode `pnpm build` antes.");
  process.exit(1);
}

const port = Number.parseInt(process.env.SMOKE_PORT || "3111", 10);
const base = `http://127.0.0.1:${port}`;
const useDev = process.argv.includes("--dev");

const command = useDev
  ? { file: path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx"), args: ["server/_core/index.ts"] }
  : { file: process.execPath, args: [entry] };

const server = spawn(command.file, command.args, {
  cwd: root,
  env: { ...process.env, NODE_ENV: useDev ? "development" : "production", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32" && command.file.endsWith(".cmd"),
});

server.stdout.on("data", chunk => process.stdout.write(`[server] ${chunk}`));
server.stderr.on("data", chunk => process.stderr.write(`[server] ${chunk}`));

const stop = code => {
  if (!server.killed) server.kill();
  process.exit(code);
};

async function waitForServer(attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return await response.json();
    } catch {
      // ainda subindo
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("servidor nao respondeu em /api/health");
}

const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

try {
  const health = await waitForServer();
  check("GET /api/health responde ok", health?.status === "ok", JSON.stringify(health));

  const html = await fetch(`${base}/`);
  const htmlBody = await html.text();
  check("GET / devolve o index do front", html.ok && htmlBody.includes("AGROLINK"), `status ${html.status}`);
  const loginRoute = await fetch(`${base}/login`);
  check("GET /login devolve o index (SPA)", loginRoute.ok, `status ${loginRoute.status}`);

  const trpc = await fetch(`${base}/api/trpc/system.health`);
  const trpcBody = await trpc.text();
  check("GET /api/trpc/system.health responde", trpc.ok && trpcBody.includes("agrolink"), trpcBody.slice(0, 120));

  const logo = await fetch(`${base}/agrolink-logo.svg`);
  check("GET /agrolink-logo.svg responde", logo.ok, `status ${logo.status}`);

  const failures = checks.filter(item => !item.ok);
  console.log(`\n[smoke] ${checks.length - failures.length}/${checks.length} verificacoes ok`);
  stop(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.error("[smoke] falha:", error instanceof Error ? error.message : error);
  stop(1);
}
