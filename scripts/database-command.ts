import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { assertDatabaseUrl, confirmActiveDatabase } from "./database-safety.ts";

const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
loadEnv({ path: resolve(projectRoot, ".env") });

const action = process.argv[2];
const commands: Record<string, string[]> = {
  migrate: ["migrate", "deploy"],
  seed: ["db", "seed"]
};
const args = action ? commands[action] : undefined;
if (!args) throw new Error("Comando de banco invalido. Use migrate ou seed.");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL e obrigatoria para operacoes de banco.");
assertDatabaseUrl(connectionString, "development");
const active = await confirmActiveDatabase(connectionString, "development");
console.log(`[database-preflight] Conexao confirmada: ${active}.`);

const prismaCli = resolve(projectRoot, "node_modules/prisma/build/index.js");
const child = spawn(process.execPath, [prismaCli, ...args], {
  cwd: projectRoot,
  env: { ...process.env, DATABASE_URL: connectionString, NODE_ENV: "development" },
  stdio: "inherit",
  shell: false
});

const exitCode = await new Promise<number>((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) reject(new Error(`Prisma interrompido pelo sinal ${signal}.`));
    else resolveExit(code ?? 1);
  });
});
if (exitCode !== 0) process.exitCode = exitCode;
