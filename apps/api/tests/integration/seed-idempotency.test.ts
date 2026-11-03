import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database.ts";
import { env } from "../../src/config/env.ts";
import {
  cleanupTestArtifacts,
  resetTestDatabase
} from "../helpers/integration.ts";
import { runTsxScript } from "../helpers/processes.ts";

const seedLotIds: string[] = [];

function scalar(value: bigint | Date | null) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function snapshotSeedState() {
  const [users, wallets, lots, bids, holds, settlements, receipts] =
    await Promise.all([
      prisma.user.findMany({
        orderBy: { id: "asc" },
        select: { id: true, email: true, role: true }
      }),
      prisma.wallet.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          userId: true,
          totalCents: true,
          reservedCents: true
        }
      }),
      prisma.lot.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          externalKey: true,
          status: true,
          currentLeaderId: true,
          currentBidCents: true,
          bidCount: true,
          auditState: true
        }
      }),
      prisma.bid.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          lotId: true,
          bidderId: true,
          sequence: true,
          amountCents: true,
          hash: true
        }
      }),
      prisma.walletHold.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          walletId: true,
          lotId: true,
          amountCents: true,
          status: true,
          currentBidId: true
        }
      }),
      prisma.auctionSettlement.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          lotId: true,
          winnerId: true,
          finalAmountCents: true,
          result: true
        }
      }),
      prisma.receipt.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          lotId: true,
          settlementId: true,
          publicToken: true
        }
      })
    ]);

  seedLotIds.splice(0, seedLotIds.length, ...lots.map((lot) => lot.id));
  const audit = await Promise.all(
    lots.map(async (lot) => {
      const bytes = await readFile(resolve(env.auditDir, `${lot.id}.jsonl`));
      return {
        lotId: lot.id,
        records: bytes.toString("utf8").trim().split("\n").length,
        digest: createHash("sha256").update(bytes).digest("hex")
      };
    })
  );
  const encode = (value: unknown) =>
    JSON.parse(
      JSON.stringify(value, (_key, item) =>
        typeof item === "bigint" || item instanceof Date ? scalar(item) : item
      )
    );
  return encode({ users, wallets, lots, bids, holds, settlements, receipts, audit });
}

beforeAll(resetTestDatabase);
afterAll(async () => {
  await cleanupTestArtifacts();
  await Promise.all(
    seedLotIds.map((id) =>
      unlink(resolve(env.auditDir, `${id}.jsonl`)).catch(() => undefined)
    )
  );
});

describe("seed em banco isolado", () => {
  it(
    "CT-030 é idempotente inclusive para saldos, reservas e auditoria",
    async () => {
      await runTsxScript("prisma/seed.ts");
      const first = await snapshotSeedState();
      await runTsxScript("prisma/seed.ts");
      const second = await snapshotSeedState();

      expect(second).toEqual(first);
      expect(first.users).toHaveLength(3);
      expect(first.lots).toHaveLength(3);
      expect(first.bids).toHaveLength(4);
      expect(first.audit).toHaveLength(3);
      expect(
        first.audit.every((entry: { records: number }) => entry.records > 0)
      ).toBe(true);
    },
    60_000
  );
});
