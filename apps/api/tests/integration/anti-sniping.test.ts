import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database.ts";
import { placeBid } from "../../src/modules/bids/bids.service.ts";
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
  sellerId = (await createTestUser("anti-sniping-seller", "AUCTIONEER")).id;
});

afterAll(cleanupTestArtifacts);

describe("prorrogacao anti-sniping", () => {
  it("nao altera o prazo fora da janela final", async () => {
    const bidder = await createTestBidder("outside-window");
    const lot = await createTestLot({ sellerId, label: "outside-window", endsInMs: 300_000 });
    const result = await placeBid({
      lotId: lot.id,
      bidderId: bidder.id,
      amountCents: 10_000n,
      key: randomUUID()
    });

    expect(result).toMatchObject({ extended: false, effectiveEndsAt: lot.effectiveEndsAt.toISOString() });
    const persisted = await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } });
    expect(persisted.effectiveEndsAt).toEqual(lot.effectiveEndsAt);
    expect(persisted.originalEndsAt).toEqual(lot.originalEndsAt);
  });

  it("soma exatamente 120 segundos ao prazo efetivo dentro da janela", async () => {
    const bidder = await createTestBidder("inside-window");
    const lot = await createTestLot({ sellerId, label: "inside-window", endsInMs: 90_000 });
    const expectedEnd = new Date(lot.effectiveEndsAt.getTime() + 120_000);
    const result = await placeBid({
      lotId: lot.id,
      bidderId: bidder.id,
      amountCents: 10_000n,
      key: randomUUID()
    });

    expect(result).toMatchObject({ extended: true, effectiveEndsAt: expectedEnd.toISOString() });
    const persisted = await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } });
    expect(persisted.effectiveEndsAt).toEqual(expectedEnd);
    expect(persisted.originalEndsAt).toEqual(lot.originalEndsAt);
    expect(persisted.version).toBe(lot.version + 1);
  });
});
