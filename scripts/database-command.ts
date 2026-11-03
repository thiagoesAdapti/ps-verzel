import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import {
  assertDatabaseUrl,
  confirmActiveDatabase,
  DATABASE_NAMES,
  type DatabaseTarget
} from "./database-safety.ts";

const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
loadEnv({ path: resolve(projectRoot, ".env") });

const action = process.argv[2];
const commands: Record<string, string[]> = {
  migrate: ["migrate", "deploy"],
  seed: ["db", "seed"]
};
const args = action ? commands[action] : undefined;
if (!args) throw new Error("Comando de banco invalido. Use migrate ou seed.");

const requestedTarget = process.argv[3] ?? "development";
if (!(requestedTarget in DATABASE_NAMES)) {
  throw new Error("Ambiente de banco invalido. Use development, test, e2e ou production.");
}
const target = requestedTarget as DatabaseTarget;
if (action === "seed" && target !== "development") {
  throw new Error("O seed principal so pode ser executado no banco de desenvolvimento.");
}

const variable = target === "development"
  ? "DATABASE_URL"
  : target === "test"
    ? "TEST_DATABASE_URL"
    : target === "e2e"
      ? "E2E_DATABASE_URL"
      : "DATABASE_URL";
const connectionString = process.env[variable];
if (!connectionString) throw new Error(`${variable} e obrigatoria para operacoes de banco.`);
assertDatabaseUrl(connectionString, target, variable);
const active = await confirmActiveDatabase(connectionString, target);
console.log(`[database-preflight] Conexao confirmada: ${active}.`);

const prismaCli = resolve(projectRoot, "node_modules/prisma/build/index.js");
const child = spawn(process.execPath, [prismaCli, ...args], {
  cwd: projectRoot,
  env: { ...process.env, DATABASE_URL: connectionString, NODE_ENV: target },
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
