import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import pg from "pg";
import {
  E2E_DATABASE_NAME,
  e2eRuntime,
  projectRoot
} from "./e2e-environment.ts";

const { Client } = pg;

async function runNodeCli(
  label: string,
  cliPath: string,
  args: string[],
  environment: Record<string, string>
) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: projectRoot,
      env: environment,
      stdio: "inherit",
      windowsHide: true,
      shell: false
    });
    child.once("error", (error) =>
      reject(
        new Error(
          `Não foi possível iniciar ${label} com ${process.execPath}. ${error.message}`,
          { cause: error }
        )
      )
    );
    child.once("exit", (code, signal) =>
      code === 0
        ? resolvePromise()
        : reject(
            new Error(
              `${label} terminou com ${signal ?? `código ${code}`}. Comando Node recusado.`
            )
          )
    );
  });
}

function exactDatabaseName(value: string) {
  return decodeURIComponent(new URL(value).pathname.slice(1));
}

async function ensureDatabaseExists() {
  const target = new URL(e2eRuntime.databaseUrl);
  if (exactDatabaseName(target.toString()) !== E2E_DATABASE_NAME) {
    throw new Error("Preparação E2E recusada: banco alvo inesperado.");
  }
  const maintenance = new URL(target);
  maintenance.pathname = "/postgres";
  const client = new Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const result = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [E2E_DATABASE_NAME]
    );
    if (!result.rows[0]?.exists) {
      try {
        await client.query(`CREATE DATABASE "${E2E_DATABASE_NAME}"`);
      } catch (error) {
        if ((error as { code?: string }).code === "42501") {
          throw new Error(
            `O banco ${E2E_DATABASE_NAME} não existe e o usuário configurado não pode criá-lo. Execute como administrador: CREATE DATABASE ${E2E_DATABASE_NAME} OWNER auction_entregavel;`
          );
        }
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

async function assertConnectedToE2e() {
  const client = new Client({ connectionString: e2eRuntime.databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ current_database: string }>(
      "SELECT current_database()"
    );
    if (result.rows[0]?.current_database !== E2E_DATABASE_NAME) {
      throw new Error(
        "Operação destrutiva recusada: a conexão ativa não é o banco E2E permitido."
      );
    }
  } finally {
    await client.end();
  }
}

async function truncateE2eDatabase() {
  const client = new Client({ connectionString: e2eRuntime.databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ current_database: string }>(
      "SELECT current_database()"
    );
    if (result.rows[0]?.current_database !== E2E_DATABASE_NAME) {
      throw new Error("TRUNCATE recusado: banco ativo inesperado.");
    }
    await client.query('TRUNCATE TABLE "users" CASCADE');
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function isolatedDirectory(relativePath: string, expectedSuffix: string) {
  const target = resolve(projectRoot, relativePath);
  const expected = resolve(projectRoot, expectedSuffix);
  if (target !== expected || !target.startsWith(projectRoot + sep)) {
    throw new Error(
      `Limpeza recusada para diretório fora do escopo E2E: ${target}`
    );
  }
  return target;
}

const environment = e2eRuntime.apiEnvironment;
const prismaCli = resolve(projectRoot, "node_modules/prisma/build/index.js");
const tsxCli = resolve(projectRoot, "node_modules/tsx/dist/cli.mjs");

await ensureDatabaseExists();
await assertConnectedToE2e();
await runNodeCli(
  "Prisma migrate deploy",
  prismaCli,
  ["migrate", "deploy"],
  e2eRuntime.prismaEnvironment
);
await assertConnectedToE2e();
await truncateE2eDatabase();

const auditDir = isolatedDirectory(
  environment.AUDIT_ANCHOR_DIR!,
  "data/audit/anchors/e2e"
);
const coverDir = isolatedDirectory(
  environment.COVER_STORAGE_DIR!,
  "data/covers/e2e"
);
await rm(auditDir, { recursive: true, force: true });
await rm(coverDir, { recursive: true, force: true });
await mkdir(auditDir, { recursive: true });
await mkdir(coverDir, { recursive: true });

await runNodeCli(
  "seed principal E2E",
  tsxCli,
  [resolve(projectRoot, "prisma/seed.ts")],
  environment
);
await runNodeCli(
  "fixtures E2E",
  tsxCli,
  [resolve(projectRoot, "scripts/seed-e2e-fixtures.ts")],
  environment
);
console.log(
  `[e2e] Banco isolado preparado e confirmado: ${E2E_DATABASE_NAME}.`
);
