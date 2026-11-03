import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.ts";
import { prisma } from "../../src/config/database.ts";
import { env } from "../../src/config/env.ts";
import { cleanupTestArtifacts, resetTestDatabase } from "../helpers/integration.ts";

let bidderId = "";
let bidderAgent: ReturnType<typeof request.agent>;
let auctioneerAgent: ReturnType<typeof request.agent>;

async function registerAndLogin(
  agent: ReturnType<typeof request.agent>,
  name: string,
  email: string,
  role: "BIDDER" | "AUCTIONEER"
) {
  const registered = await agent
    .post("/api/auth/register")
    .set("Origin", env.APP_ORIGIN)
    .send({ name, email, password: "SenhaSegura123", role });
  await agent
    .post("/api/auth/login")
    .set("Origin", env.APP_ORIGIN)
    .send({ email, password: "SenhaSegura123" });
  return registered.body.data.id as string;
}

beforeAll(async () => {
  await resetTestDatabase();
  bidderAgent = request.agent(app);
  auctioneerAgent = request.agent(app);
  bidderId = await registerAndLogin(
    bidderAgent,
    "Licitante da carteira",
    "bidder-wallet@integration.local",
    "BIDDER"
  );
  await registerAndLogin(
    auctioneerAgent,
    "Leiloeira sem depósito",
    "auctioneer-wallet@integration.local",
    "AUCTIONEER"
  );
});

afterAll(cleanupTestArtifacts);

describe("wallet deposits and statements", () => {
  it("enforces authentication, bidder role, UUID key, and deposit bounds", async () => {
    expect((await request(app).get("/api/wallet")).status).toBe(401);

    const initial = await bidderAgent.get("/api/wallet");
    expect(initial.status).toBe(200);
    expect(initial.body.data).toEqual({
      currency: "BRL",
      totalCents: "0",
      reservedCents: "0",
      availableCents: "0"
    });

    const auctioneerDeposit = await auctioneerAgent
      .post("/api/wallet/deposits")
      .set("Origin", env.APP_ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ amountCents: "10000" });
    expect(auctioneerDeposit.status).toBe(403);

    const invalidKey = await bidderAgent
      .post("/api/wallet/deposits")
      .set("Origin", env.APP_ORIGIN)
      .set("Idempotency-Key", "not-a-uuid")
      .send({ amountCents: "10000" });
    const belowMinimum = await bidderAgent
      .post("/api/wallet/deposits")
      .set("Origin", env.APP_ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ amountCents: "99" });
    expect(invalidKey.status).toBe(422);
    expect(belowMinimum.status).toBe(422);
  });

  it("replays the same response, rejects a changed digest, and paginates one movement per deposit", async () => {
    const key = randomUUID();
    const first = await bidderAgent
      .post("/api/wallet/deposits")
      .set("Origin", env.APP_ORIGIN)
      .set("Idempotency-Key", key)
      .send({ amountCents: "5000" });
    const replay = await bidderAgent
      .post("/api/wallet/deposits")
      .set("Origin", env.APP_ORIGIN)
      .set("Idempotency-Key", key)
      .send({ amountCents: "5000" });
    const conflict = await bidderAgent
      .post("/api/wallet/deposits")
      .set("Origin", env.APP_ORIGIN)
      .set("Idempotency-Key", key)
      .send({ amountCents: "6000" });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.data).toEqual(first.body.data);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const second = await bidderAgent
      .post("/api/wallet/deposits")
      .set("Origin", env.APP_ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ amountCents: "2000" });
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({
      totalCents: "7000",
      reservedCents: "0",
      availableCents: "7000"
    });

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: bidderId } });
    expect(wallet).toMatchObject({ totalCents: 7000n, reservedCents: 0n });
    expect(await prisma.walletTransaction.count({
      where: { walletId: wallet.id, type: "DEPOSIT" }
    })).toBe(2);
    expect(await prisma.idempotencyRecord.count({
      where: { actorUserId: bidderId, operation: "DEPOSIT", status: "CONFIRMED" }
    })).toBe(2);

    const firstPage = await bidderAgent.get("/api/wallet/transactions?page=1&limit=1");
    const secondPage = await bidderAgent.get("/api/wallet/transactions?page=2&limit=1");
    expect(firstPage.body.data).toHaveLength(1);
    expect(secondPage.body.data).toHaveLength(1);
    expect(firstPage.body.data[0].id).not.toBe(secondPage.body.data[0].id);
    expect(secondPage.body.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
    expect(secondPage.body.data[0]).toMatchObject({
      type: "DEPOSIT",
      lotTitle: null,
      receiptToken: null
    });
  });
});
