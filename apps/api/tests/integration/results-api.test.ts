import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.ts";
import { prisma } from "../../src/config/database.ts";
import { settleLot } from "../../src/modules/auctions/settlement.service.ts";
import { placeBid } from "../../src/modules/bids/bids.service.ts";
import {
  cleanupTestArtifacts,
  createTestBidder,
  createTestLot,
  createTestUser,
  resetTestDatabase,
  sessionCookie
} from "../helpers/integration.ts";

beforeEach(resetTestDatabase);
afterAll(cleanupTestArtifacts);

async function soldLot() {
  const seller = await createTestUser("results-seller", "AUCTIONEER");
  const winner = await createTestBidder("results-winner", 100_000n);
  const other = await createTestBidder("results-other", 100_000n);
  const lot = await createTestLot({ sellerId: seller.id, label: "results" });
  await placeBid({ lotId: lot.id, bidderId: other.id, amountCents: 10_000n, key: randomUUID() });
  await placeBid({ lotId: lot.id, bidderId: winner.id, amountCents: 12_000n, key: randomUUID() });
  const endedAt = new Date(Date.now() - 1_000);
  await prisma.lot.update({
    where: { id: lot.id },
    data: { originalEndsAt: endedAt, effectiveEndsAt: endedAt }
  });
  await settleLot(lot.id);
  const receipt = await prisma.receipt.findUniqueOrThrow({ where: { lotId: lot.id } });
  return { seller, winner, other, lot, receipt };
}

describe("resultados privados e comprovante publico", () => {
  it("pagina participacoes e resume todos os registros do licitante", async () => {
    const { winner, lot, receipt } = await soldLot();
    const cookie = await sessionCookie(winner.id);
    const response = await request(app)
      .get("/api/my/participations?page=1&limit=1")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.meta).toMatchObject({ page: 1, limit: 1, total: 1, totalPages: 1 });
    expect(response.body.summary).toEqual({ total: 1, leading: 0, won: 1 });
    expect(response.body.data).toEqual([expect.objectContaining({
      lotId: lot.id,
      highestBidCents: "12000",
      isLeading: true,
      won: true,
      finalAmountCents: "12000",
      receiptToken: receipt.publicToken
    })]);
  });

  it("lista vitorias e protege colecoes privadas por papel", async () => {
    const { seller, winner, lot, receipt } = await soldLot();
    const winnerCookie = await sessionCookie(winner.id);
    const sellerCookie = await sessionCookie(seller.id);
    const wins = await request(app).get("/api/my/wins").set("Cookie", winnerCookie).expect(200);
    expect(wins.body.data).toEqual([expect.objectContaining({
      lotId: lot.id,
      finalAmountCents: "12000",
      receiptToken: receipt.publicToken
    })]);
    await request(app).get("/api/my/participations").expect(401);
    await request(app).get("/api/my/wins").set("Cookie", sellerCookie).expect(403);
  });

  it("publica somente dados pseudonimos e valida o token", async () => {
    const { winner, lot, receipt } = await soldLot();
    const response = await request(app)
      .get(`/api/receipts/${receipt.publicToken}`)
      .expect(200);
    expect(response.body.data).toMatchObject({
      token: receipt.publicToken,
      lotId: lot.id,
      finalAmountCents: "12000",
      winner: "Licitante 02",
      result: "SOLD"
    });
    const publicPayload = JSON.stringify(response.body);
    expect(publicPayload).not.toContain(winner.id);
    expect(publicPayload).not.toContain(winner.email);
    expect(publicPayload).not.toMatch(/userId|winnerId|bidderId/i);

    await request(app).get("/api/receipts/invalido").expect(422);
    await request(app).get(`/api/receipts/${"A".repeat(43)}`).expect(404);
  });
});
