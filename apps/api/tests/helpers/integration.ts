import { resolve } from "node:path";
import { prisma } from "../../src/config/database.ts";
import { env, projectRoot } from "../../src/config/env.ts";

const EXPECTED_DATABASE = "auction_house_entregavel_test";
const EXPECTED_AUDIT_DIR = resolve(projectRoot, "data/audit/test-anchors");
const EXPECTED_COVER_DIR = resolve(projectRoot, "data/covers/test");

function assertIntegrationStorage() {
  if (resolve(env.auditDir) !== EXPECTED_AUDIT_DIR) {
    throw new Error("Limpeza recusada: diretorio de auditoria de integracao inesperado.");
  }
  if (resolve(env.coverDir) !== EXPECTED_COVER_DIR) {
    throw new Error("Limpeza recusada: diretorio de capas de integracao inesperado.");
  }
}

export async function assertIntegrationDatabase() {
  if (new URL(env.databaseUrl).pathname !== `/${EXPECTED_DATABASE}`) {
    throw new Error(`A suite integrada exige a URL exclusiva ${EXPECTED_DATABASE}.`);
  }
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  if (rows[0]?.current_database !== EXPECTED_DATABASE) {
    throw new Error(`Operacao destrutiva recusada: a conexao ativa nao e ${EXPECTED_DATABASE}.`);
  }
  assertIntegrationStorage();
}

export async function resetTestDatabase() {
  await assertIntegrationDatabase();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
}

export async function cleanupTestArtifacts() {
  await assertIntegrationDatabase();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
}
