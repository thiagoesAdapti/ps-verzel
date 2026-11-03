import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../../src/config/database.ts";
import { env, projectRoot } from "../../src/config/env.ts";
import { createLot } from "../../src/modules/lots/lots.service.ts";
import { depositFunds } from "../../src/modules/wallets/wallets.service.ts";
import { hashPassword, randomToken, sha256 } from "../../src/shared/crypto.ts";
import { clearTestFaults } from "../../src/shared/test-faults.ts";

const EXPECTED_DATABASE = "auction_house_entregavel_test";
const EXPECTED_AUDIT_DIR = resolve(projectRoot, "data/audit/test-anchors");
const EXPECTED_COVER_DIR = resolve(projectRoot, "data/covers/test");
const ledgerIds = new Set<string>();
let passwordHash: Promise<string> | undefined;

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
  clearTestFaults();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
}

export async function cleanupTestArtifacts() {
  await assertIntegrationDatabase();
  clearTestFaults();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
  await Promise.all(
    [...ledgerIds].map((id) => unlink(resolve(env.auditDir, `${id}.jsonl`)).catch(() => undefined))
  );
  ledgerIds.clear();
}

export async function createTestUser(label: string, role: "AUCTIONEER" | "BIDDER") {
  passwordHash ??= hashPassword("SenhaSegura123");
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      name: `Integracao ${label}`,
      email: `${label}-${id}@test.local`,
      passwordHash: await passwordHash,
      role,
      wallet: { create: { id: randomUUID() } }
    }
  });
}

export async function createTestBidder(label: string, balanceCents = 100_000n) {
  const bidder = await createTestUser(label, "BIDDER");
  if (balanceCents > 0n) {
    await depositFunds({ userId: bidder.id, amountCents: balanceCents, key: randomUUID() });
  }
  return bidder;
}

export async function createTestLot(input: {
  sellerId: string;
  label: string;
  startsInMs?: number;
  endsInMs?: number;
  startingBidCents?: bigint;
  minimumIncrementCents?: bigint;
}) {
  const now = Date.now();
  const lot = await createLot({
    sellerId: input.sellerId,
    book: {
      key: `integration-${input.label}-${randomUUID()}`,
      title: `Livro ${input.label}`,
      authors: ["Autoria de Integracao"],
      publicationYear: 2026,
      publisher: "Editora de Integracao",
      coverId: null
    },
    description: "Exemplar criado para validar o comportamento integrado do leilao.",
    condition: "GOOD",
    startingBidCents: input.startingBidCents ?? 10_000n,
    minimumIncrementCents: input.minimumIncrementCents ?? 2_000n,
    startsAt: new Date(now + (input.startsInMs ?? -60_000)),
    endsAt: new Date(now + (input.endsInMs ?? 600_000))
  });
  ledgerIds.add(lot.id);
  return lot;
}

export function ledgerPath(lotId: string) {
  return resolve(env.auditDir, `${lotId}.jsonl`);
}

export async function sessionCookie(userId: string) {
  const raw = randomToken();
  await prisma.session.create({
    data: {
      id: randomUUID(),
      userId,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + 60_000)
    }
  });
  return `auction_sid=${raw}`;
}
