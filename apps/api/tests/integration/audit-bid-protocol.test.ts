import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database.ts";
import { readLedger, validateLedger } from "../../src/modules/audit/audit-ledger.service.ts";
import { placeBid } from "../../src/modules/bids/bids.service.ts";
import { armTestFault, clearTestFaults } from "../../src/shared/test-faults.ts";
import {
  cleanupTestArtifacts,
  createTestBidder,
  createTestLot,
  createTestUser,
  resetTestDatabase
} from "../helpers/integration.ts";

let sellerId = "";

beforeAll(async () => {
  await resetTestDatabase();
  sellerId = (await createTestUser("audit-protocol-seller", "AUCTIONEER")).id;
});

afterEach(clearTestFaults);
afterAll(cleanupTestArtifacts);

describe("protocolo de auditoria do lance", () => {
  it("registra ABORT e nenhum efeito financeiro quando falha depois do PREPARE", async () => {
    const bidder = await createTestBidder("fault-before");
    const lot = await createTestLot({ sellerId, label: "fault-before" });
    const key = randomUUID();
    armTestFault("bid.after_prepare");

    await expect(placeBid({ lotId: lot.id, bidderId: bidder.id, amountCents: 10_000n, key }))
      .rejects.toThrow("TEST_FAULT:bid.after_prepare");
    expect(await prisma.bid.count({ where: { lotId: lot.id } })).toBe(0);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: bidder.id } })).reservedCents)
      .toBe(0n);
    expect(await prisma.idempotencyRecord.findUniqueOrThrow({
      where: {
        actorUserId_operation_key: {
          actorUserId: bidder.id,
          operation: `BID:${lot.id}`,
          key
        }
      }
    })).toMatchObject({ status: "FAILED", responseStatus: 500 });

    const ledger = await readLedger(lot.id);
    expect(validateLedger(ledger)).toBe(true);
    expect(ledger.map((record) => record.type)).toEqual([
      "GENESIS_PREPARE",
      "GENESIS_COMMIT",
      "BID_PREPARE",
      "ABORT"
    ]);
  });

  it("mantem resultado incerto PENDING depois do commit do banco sem BID_COMMIT", async () => {
    const bidder = await createTestBidder("fault-after");
    const lot = await createTestLot({ sellerId, label: "fault-after" });
    const key = randomUUID();
    armTestFault("bid.after_database_commit");

    await expect(placeBid({ lotId: lot.id, bidderId: bidder.id, amountCents: 10_000n, key }))
      .rejects.toThrow("TEST_FAULT:bid.after_database_commit");
    expect(await prisma.bid.count({ where: { lotId: lot.id } })).toBe(1);
    expect(await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } }))
      .toMatchObject({ auditState: "PENDING", bidCount: 1, currentLeaderId: bidder.id });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: bidder.id } })).reservedCents)
      .toBe(10_000n);
    expect(await prisma.idempotencyRecord.findUniqueOrThrow({
      where: {
        actorUserId_operation_key: {
          actorUserId: bidder.id,
          operation: `BID:${lot.id}`,
          key
        }
      }
    })).toMatchObject({ status: "PENDING", responseStatus: null });

    const ledger = await readLedger(lot.id);
    expect(validateLedger(ledger)).toBe(true);
    expect(ledger.map((record) => record.type)).toEqual([
      "GENESIS_PREPARE",
      "GENESIS_COMMIT",
      "BID_PREPARE"
    ]);
    await expect(placeBid({ lotId: lot.id, bidderId: bidder.id, amountCents: 10_000n, key }))
      .rejects.toMatchObject({ code: "AUDIT_PENDING", status: 423 });
    expect(await prisma.bid.count({ where: { lotId: lot.id } })).toBe(1);
  });
});
