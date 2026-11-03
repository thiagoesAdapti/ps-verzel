import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database.ts";
import { readLedger, validateLedger } from "../../src/modules/audit/audit-ledger.service.ts";
import { recoverPendingAudits } from "../../src/modules/audit/audit.service.ts";
import { placeBid } from "../../src/modules/bids/bids.service.ts";
import { armTestFault, clearTestFaults } from "../../src/shared/test-faults.ts";
import {
  cleanupTestArtifacts,
  createTestBidder,
  createTestLot,
  createTestUser,
  ledgerPath,
  resetTestDatabase
} from "../helpers/integration.ts";

let sellerId = "";

beforeAll(async () => {
  await resetTestDatabase();
  sellerId = (await createTestUser("recovery-seller", "AUCTIONEER")).id;
});

afterEach(clearTestFaults);
afterAll(cleanupTestArtifacts);

describe("recuperacao de auditorias pendentes", () => {
  it("conclui genesis persistido cuja confirmacao externa ficou pendente", async () => {
    const lot = await createTestLot({ sellerId, label: "pending-genesis" });
    const records = await readLedger(lot.id);
    expect(records.map((record) => record.type)).toEqual(["GENESIS_PREPARE", "GENESIS_COMMIT"]);
    await writeFile(ledgerPath(lot.id), `${JSON.stringify(records[0])}\n`);
    await prisma.lot.update({ where: { id: lot.id }, data: { auditState: "PENDING" } });

    await recoverPendingAudits();
    expect((await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } })).auditState).toBe("READY");
    const recovered = await readLedger(lot.id);
    expect(validateLedger(recovered)).toBe(true);
    expect(recovered.map((record) => record.type)).toEqual(["GENESIS_PREPARE", "GENESIS_COMMIT"]);

    await recoverPendingAudits();
    expect((await readLedger(lot.id))).toHaveLength(2);
  });

  it("confirma bid persistido sem duplicar lance, reserva ou prova", async () => {
    const bidder = await createTestBidder("pending-bid");
    const lot = await createTestLot({ sellerId, label: "pending-bid" });
    const key = randomUUID();
    armTestFault("bid.after_database_commit");
    await expect(placeBid({ lotId: lot.id, bidderId: bidder.id, amountCents: 10_000n, key }))
      .rejects.toThrow("TEST_FAULT:bid.after_database_commit");

    await recoverPendingAudits();
    expect(await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } }))
      .toMatchObject({ auditState: "READY", bidCount: 1 });
    expect(await prisma.idempotencyRecord.findFirstOrThrow({
      where: { actorUserId: bidder.id, operation: `BID:${lot.id}`, key }
    })).toMatchObject({ status: "CONFIRMED", responseStatus: 201 });
    expect((await readLedger(lot.id)).map((record) => record.type)).toEqual([
      "GENESIS_PREPARE",
      "GENESIS_COMMIT",
      "BID_PREPARE",
      "BID_COMMIT"
    ]);

    await placeBid({ lotId: lot.id, bidderId: bidder.id, amountCents: 10_000n, key });
    await recoverPendingAudits();
    expect(await prisma.bid.count({ where: { lotId: lot.id } })).toBe(1);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: bidder.id } })).reservedCents)
      .toBe(10_000n);
    expect(await readLedger(lot.id)).toHaveLength(4);
  });

  it("nao libera lote quando a cadeia externa e invalida", async () => {
    const lot = await createTestLot({ sellerId, label: "invalid-ledger" });
    const path = ledgerPath(lot.id);
    const records = (await readFile(path, "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    records[0]!.signature = `x${String(records[0]!.signature).slice(1)}`;
    await writeFile(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
    await prisma.lot.update({ where: { id: lot.id }, data: { auditState: "PENDING" } });

    await recoverPendingAudits();
    expect((await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } })).auditState)
      .toBe("COMPROMISED");
  });
});
