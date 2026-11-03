import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.ts";
import { prisma } from "../../src/config/database.ts";
import { env } from "../../src/config/env.ts";
import {
  cleanupTestArtifacts,
  createTestBidder,
  createTestLot,
  createTestUser,
  resetTestDatabase,
  sessionCookie
} from "../helpers/integration.ts";

class HttpArrivalGate {
  private remaining = 0;
  private release: (() => void) | undefined;
  private waiting = Promise.resolve();

  arm(requests: number) {
    this.remaining = requests;
    this.waiting = new Promise<void>((resolveWait) => {
      this.release = resolveWait;
    });
  }

  middleware = (req: Request, _res: Response, next: NextFunction) => {
    if (
      this.remaining <= 0
      || req.method !== "POST"
      || !/^\/api\/lots\/[0-9a-f-]+\/bids$/i.test(req.path)
    ) {
      return next();
    }
    this.remaining -= 1;
    if (this.remaining === 0) this.release?.();
    void this.waiting.then(() => next(), next);
  };
}

const gate = new HttpArrivalGate();
let server: HttpServer;
let origin = "";
let sellerId = "";

async function postBid(lotId: string, cookie: string, amountCents: bigint) {
  return fetch(`${origin}/api/lots/${lotId}/bids`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: env.APP_ORIGIN,
      "Idempotency-Key": randomUUID()
    },
    body: JSON.stringify({ amountCents: amountCents.toString() })
  });
}

beforeAll(async () => {
  const wrapper = express();
  wrapper.use(gate.middleware, app);
  server = createServer(wrapper);
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Servidor HTTP de concorrencia sem porta.");
  }
  origin = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await resetTestDatabase();
  sellerId = (await createTestUser("http-concurrency-seller", "AUCTIONEER")).id;
});

afterAll(async () => {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  await cleanupTestArtifacts();
});

describe("concorrencia por requisicoes HTTP reais", () => {
  it("CT-013 aceita somente um de dois lances minimos simultaneos", async () => {
    const bidder1 = await createTestBidder("ct013-one", 20_000n);
    const bidder2 = await createTestBidder("ct013-two", 20_000n);
    const lot = await createTestLot({
      sellerId,
      label: "ct013",
      startingBidCents: 10_000n,
      minimumIncrementCents: 2_000n
    });
    const [cookie1, cookie2] = await Promise.all([
      sessionCookie(bidder1.id),
      sessionCookie(bidder2.id)
    ]);

    gate.arm(2);
    const responses = await Promise.all([
      postBid(lot.id, cookie1, 10_000n),
      postBid(lot.id, cookie2, 10_000n)
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);

    const persistedLot = await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } });
    const bids = await prisma.bid.findMany({ where: { lotId: lot.id } });
    const wallets = await prisma.wallet.findMany({
      where: { userId: { in: [bidder1.id, bidder2.id] } },
      orderBy: { userId: "asc" }
    });
    const holds = await prisma.walletHold.findMany({ where: { lotId: lot.id, status: "ACTIVE" } });
    expect(bids).toHaveLength(1);
    expect(persistedLot).toMatchObject({
      bidCount: 1,
      currentBidCents: 10_000n,
      currentLeaderId: bids[0]!.bidderId
    });
    expect(wallets.reduce((sum, wallet) => sum + wallet.reservedCents, 0n)).toBe(10_000n);
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({ amountCents: 10_000n, currentBidId: bids[0]!.id });
  });

  it("CT-014 impede o mesmo saldo de ser comprometido simultaneamente em dois lotes", async () => {
    const bidder = await createTestBidder("ct014", 20_000n);
    const lot1 = await createTestLot({ sellerId, label: "ct014-one", startingBidCents: 15_000n });
    const lot2 = await createTestLot({ sellerId, label: "ct014-two", startingBidCents: 15_000n });
    const cookie = await sessionCookie(bidder.id);

    gate.arm(2);
    const responses = await Promise.all([
      postBid(lot1.id, cookie, 15_000n),
      postBid(lot2.id, cookie, 15_000n)
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: bidder.id } });
    const bids = await prisma.bid.findMany({ where: { bidderId: bidder.id } });
    const activeHolds = await prisma.walletHold.findMany({
      where: { walletId: wallet.id, status: "ACTIVE" }
    });
    expect(bids).toHaveLength(1);
    expect(wallet).toMatchObject({ totalCents: 20_000n, reservedCents: 15_000n });
    expect(wallet.reservedCents).toBeLessThanOrEqual(wallet.totalCents);
    expect(activeHolds).toHaveLength(1);
    expect(activeHolds.reduce((sum, hold) => sum + hold.amountCents, 0n)).toBe(wallet.reservedCents);
  });
});
