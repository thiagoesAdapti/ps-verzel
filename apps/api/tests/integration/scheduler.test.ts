import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database.ts";
import { runAuctionCycle } from "../../src/jobs/auction-scheduler.ts";
import {
  cleanupTestArtifacts,
  createTestLot,
  createTestUser,
  resetTestDatabase
} from "../helpers/integration.ts";

beforeEach(resetTestDatabase);
afterAll(cleanupTestArtifacts);

describe("scheduler de lotes", () => {
  it("inicia somente lotes agendados READY e incrementa a versao", async () => {
    const seller = await createTestUser("scheduler-start", "AUCTIONEER");
    const ready = await createTestLot({
      sellerId: seller.id,
      label: "scheduled-ready",
      startsInMs: 60_000,
      endsInMs: 300_000
    });
    const pending = await createTestLot({
      sellerId: seller.id,
      label: "scheduled-pending",
      startsInMs: 60_000,
      endsInMs: 300_000
    });
    const startedAt = new Date(Date.now() - 1_000);
    await prisma.lot.updateMany({
      where: { id: { in: [ready.id, pending.id] } },
      data: { startsAt: startedAt }
    });
    await prisma.lot.update({ where: { id: pending.id }, data: { auditState: "PENDING" } });

    await runAuctionCycle();
    expect(await prisma.lot.findUniqueOrThrow({ where: { id: ready.id } }))
      .toMatchObject({ status: "LIVE", version: ready.version + 1 });
    expect(await prisma.lot.findUniqueOrThrow({ where: { id: pending.id } }))
      .toMatchObject({ status: "SCHEDULED", auditState: "PENDING", version: pending.version });
  });

  it("respeita effectiveEndsAt prorrogado e encerra somente depois do prazo efetivo", async () => {
    const seller = await createTestUser("scheduler-end", "AUCTIONEER");
    const lot = await createTestLot({ sellerId: seller.id, label: "effective-end" });
    await prisma.lot.update({
      where: { id: lot.id },
      data: {
        originalEndsAt: new Date(Date.now() - 1_000),
        effectiveEndsAt: new Date(Date.now() + 60_000)
      }
    });

    await runAuctionCycle();
    expect((await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } })).status).toBe("LIVE");
    expect(await prisma.auctionSettlement.count({ where: { lotId: lot.id } })).toBe(0);

    await prisma.lot.update({
      where: { id: lot.id },
      data: { effectiveEndsAt: new Date(Date.now() - 1_000) }
    });
    await runAuctionCycle();
    expect((await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } })).status).toBe("ENDED");
    expect(await prisma.auctionSettlement.findUniqueOrThrow({ where: { lotId: lot.id } }))
      .toMatchObject({ result: "UNSOLD" });
  });
});
