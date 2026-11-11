#!/usr/bin/env node
/**
 * Servidor de desenvolvimento estatico (somente Vite, sem Express).
 *
 * Existe porque a sintaxe POSIX `${PORT:-3000}` nao funciona no `cmd.exe`
 * do Windows, o que quebrava `pnpm dev:static` em maquinas Windows.
 * Aqui a porta e resolvida em Node e passada explicitamente ao Vite.
 */
import { spawn } from "node:child_process";
import process from "node:process";

const port = Number.parseInt(process.env.PORT || "3000", 10) || 3000;
const host = process.env.HOST || "0.0.0.0";

const args = ["vite", "--host", host, "--port", String(port), "--strictPort"];

const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (error) => {
  console.error("[dev:static] falha ao iniciar o vite:", error);
  process.exit(1);
});
