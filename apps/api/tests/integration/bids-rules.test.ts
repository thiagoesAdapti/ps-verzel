import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.ts";
import { prisma } from "../../src/config/database.ts";
import { env } from "../../src/config/env.ts";
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
  sellerId = (await createTestUser("rules-seller", "AUCTIONEER")).id;
});

afterAll(cleanupTestArtifacts);

describe("regras do motor de lances", () => {
  it("valida lance inicial, incremento, lideranca propria e saldo suficiente", async () => {
    const bidder1 = await createTestBidder("rules-one", 100_000n);
    const bidder2 = await createTestBidder("rules-two", 100_000n);
    const poorBidder = await createTestBidder("rules-poor", 5_000n);
    const lot = await createTestLot({ sellerId, label: "rules" });

    await expect(placeBid({ lotId: lot.id, bidderId: bidder1.id, amountCents: 9_999n, key: randomUUID() }))
      .rejects.toMatchObject({ code: "BID_BELOW_MINIMUM" });
    await placeBid({ lotId: lot.id, bidderId: bidder1.id, amountCents: 10_000n, key: randomUUID() });
    await expect(placeBid({ lotId: lot.id, bidderId: bidder1.id, amountCents: 12_000n, key: randomUUID() }))
      .rejects.toMatchObject({ code: "ALREADY_LEADING" });
    await expect(placeBid({ lotId: lot.id, bidderId: bidder2.id, amountCents: 11_999n, key: randomUUID() }))
      .rejects.toMatchObject({ code: "BID_BELOW_MINIMUM" });
    await expect(placeBid({ lotId: lot.id, bidderId: poorBidder.id, amountCents: 12_000n, key: randomUUID() }))
      .rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });

    expect(await prisma.bid.count({ where: { lotId: lot.id } })).toBe(1);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: bidder1.id } })).reservedCents)
      .toBe(10_000n);
  });

  it("rejeita lotes futuros, encerrados e cancelados com codigos distintos", async () => {
    const bidder = await createTestBidder("periods");
    const future = await createTestLot({ sellerId, label: "future", startsInMs: 60_000, endsInMs: 120_000 });
    await expect(placeBid({ lotId: future.id, bidderId: bidder.id, amountCents: 10_000n, key: randomUUID() }))
      .rejects.toMatchObject({ code: "LOT_NOT_STARTED" });

    const ended = await createTestLot({ sellerId, label: "ended" });
    const endedAt = new Date(Date.now() - 1_000);
    await prisma.lot.update({
      where: { id: ended.id },
      data: { originalEndsAt: endedAt, effectiveEndsAt: endedAt, status: "ENDED" }
    });
    await expect(placeBid({ lotId: ended.id, bidderId: bidder.id, amountCents: 10_000n, key: randomUUID() }))
      .rejects.toMatchObject({ code: "LOT_ENDED" });

    const cancelled = await createTestLot({ sellerId, label: "cancelled" });
    await prisma.lot.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });
    await expect(placeBid({ lotId: cancelled.id, bidderId: bidder.id, amountCents: 10_000n, key: randomUUID() }))
      .rejects.toMatchObject({ code: "LOT_CANCELLED" });
  });

  it("expoe somente pseudonimos sequenciais no historico publico", async () => {
    const bidder1 = await createTestBidder("public-one");
    const bidder2 = await createTestBidder("public-two");
    const lot = await createTestLot({ sellerId, label: "public-history" });
    await placeBid({ lotId: lot.id, bidderId: bidder1.id, amountCents: 10_000n, key: randomUUID() });
    await placeBid({ lotId: lot.id, bidderId: bidder2.id, amountCents: 12_000n, key: randomUUID() });

    const response = await request(app)
      .get(`/api/lots/${lot.id}/bids`)
      .set("Origin", env.APP_ORIGIN)
      .expect(200);
    expect(response.body.data.map((bid: { participant: string }) => bid.participant)).toEqual([
      "Licitante 02",
      "Licitante 01"
    ]);
    expect(JSON.stringify(response.body)).not.toContain(bidder1.id);
    expect(JSON.stringify(response.body)).not.toContain(bidder1.email);
    expect(JSON.stringify(response.body)).not.toContain(bidder2.id);
    expect(JSON.stringify(response.body)).not.toContain(bidder2.email);
  });

  it("reexecuta a mesma chave sem duplicar e rejeita digest diferente", async () => {
    const bidder = await createTestBidder("idempotent");
    const lot = await createTestLot({ sellerId, label: "idempotent" });
    const key = randomUUID();
    const first = await placeBid({ lotId: lot.id, bidderId: bidder.id, amountCents: 10_000n, key });
    const replay = await placeBid({ lotId: lot.id, bidderId: bidder.id, amountCents: 10_000n, key });
    expect(replay).toEqual(first);
    await expect(placeBid({ lotId: lot.id, bidderId: bidder.id, amountCents: 12_000n, key }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await prisma.bid.count({ where: { lotId: lot.id } })).toBe(1);
  });
});
