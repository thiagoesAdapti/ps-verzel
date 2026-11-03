import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database.ts";
import { env } from "../../src/config/env.ts";
import { placeBid } from "../../src/modules/bids/bids.service.ts";
import { app } from "../../src/app.ts";
import {
  closeSockets,
  createSocketServer
} from "../../src/realtime/socket.server.ts";
import {
  cleanupTestArtifacts,
  createTestBidder,
  createTestLot,
  createTestUser,
  resetTestDatabase,
  sessionCookie
} from "../helpers/integration.ts";

const clients: ClientSocket[] = [];
let sellerId = "";
let server: HttpServer;
let baseUrl = "";

async function openClient() {
  const client = createClient(baseUrl, {
    path: "/socket.io",
    transports: ["websocket"],
    forceNew: true,
    reconnection: false
  });
  clients.push(client);
  await new Promise<void>((resolveConnection, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Cliente em tempo real não conectou.")),
      2_000
    );
    client.once("connect", () => {
      clearTimeout(timer);
      resolveConnection();
    });
    client.once("connect_error", reject);
  });
  return client;
}

beforeAll(async () => {
  await resetTestDatabase();
  sellerId = (await createTestUser("lifecycle-seller", "AUCTIONEER")).id;
  server = createServer(app);
  createSocketServer(server);
  await new Promise<void>((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen)
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Porta em tempo real indisponível.");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  for (const client of clients) client.close();
  await closeSockets();
  if (server.listening) {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
  await cleanupTestArtifacts();
});

describe("lifecycle com sincronização em tempo real", () => {
  it("propaga lances reais a dois clientes e libera a reserva anterior", async () => {
    const bidder1 = await createTestBidder("realtime-one");
    const bidder2 = await createTestBidder("realtime-two");
    const lot = await createTestLot({ sellerId, label: "realtime-bidders" });
    const client1 = await openClient();
    const client2 = await openClient();

    expect(
      await client1.timeout(1_000).emitWithAck("lot:join", { lotId: lot.id })
    ).toEqual({ ok: true });
    expect(
      await client2.timeout(1_000).emitWithAck("lot:join", { lotId: lot.id })
    ).toEqual({ ok: true });

    const firstOnClient1 = new Promise<Record<string, unknown>>((resolveEvent) =>
      client1.once("bid:accepted", resolveEvent)
    );
    const firstOnClient2 = new Promise<Record<string, unknown>>((resolveEvent) =>
      client2.once("bid:accepted", resolveEvent)
    );
    await placeBid({
      lotId: lot.id,
      bidderId: bidder1.id,
      amountCents: 10_000n,
      key: randomUUID()
    });

    expect(await firstOnClient1).toMatchObject({
      lotId: lot.id,
      sequence: 1,
      amountCents: "10000",
      participant: "Licitante 01"
    });
    expect(await firstOnClient2).toMatchObject({
      lotId: lot.id,
      sequence: 1,
      amountCents: "10000",
      participant: "Licitante 01"
    });

    const secondOnClient1 = new Promise<Record<string, unknown>>((resolveEvent) =>
      client1.once("bid:accepted", resolveEvent)
    );
    const secondOnClient2 = new Promise<Record<string, unknown>>((resolveEvent) =>
      client2.once("bid:accepted", resolveEvent)
    );
    await placeBid({
      lotId: lot.id,
      bidderId: bidder2.id,
      amountCents: 12_000n,
      key: randomUUID()
    });

    expect(await secondOnClient1).toMatchObject({
      lotId: lot.id,
      sequence: 2,
      amountCents: "12000",
      participant: "Licitante 02"
    });
    expect(await secondOnClient2).toMatchObject({
      lotId: lot.id,
      sequence: 2,
      amountCents: "12000",
      participant: "Licitante 02"
    });
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { userId: bidder1.id } }))
        .reservedCents
    ).toBe(0n);
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { userId: bidder2.id } }))
        .reservedCents
    ).toBe(12_000n);
  });

  it("ressincroniza por HTTP após reconectar sem duplicar lances", async () => {
    const bidder1 = await createTestBidder("reconnect-one");
    const bidder2 = await createTestBidder("reconnect-two");
    const lot = await createTestLot({ sellerId, label: "reconnect" });
    const [cookie1, cookie2] = await Promise.all([
      sessionCookie(bidder1.id),
      sessionCookie(bidder2.id)
    ]);
    const observer = await openClient();
    expect(
      await observer.timeout(1_000).emitWithAck("lot:join", { lotId: lot.id })
    ).toEqual({ ok: true });

    const firstResponse = await fetch(`${baseUrl}/api/lots/${lot.id}/bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie1,
        Origin: env.APP_ORIGIN,
        "Idempotency-Key": randomUUID()
      },
      body: JSON.stringify({ amountCents: "10000" })
    });
    expect(firstResponse.status).toBe(201);

    observer.disconnect();
    expect(observer.connected).toBe(false);
    const secondResponse = await fetch(`${baseUrl}/api/lots/${lot.id}/bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie2,
        Origin: env.APP_ORIGIN,
        "Idempotency-Key": randomUUID()
      },
      body: JSON.stringify({ amountCents: "12000" })
    });
    expect(secondResponse.status).toBe(201);

    const reconnected = new Promise<void>((resolveConnection, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Socket.IO não reconectou.")),
        2_000
      );
      observer.once("connect", () => {
        clearTimeout(timer);
        resolveConnection();
      });
      observer.once("connect_error", reject);
    });
    observer.connect();
    await reconnected;
    expect(
      await observer.timeout(1_000).emitWithAck("lot:join", { lotId: lot.id })
    ).toEqual({ ok: true });

    const [detailResponse, bidsResponse] = await Promise.all([
      fetch(`${baseUrl}/api/lots/${lot.id}`, {
        headers: { Cookie: cookie1 }
      }),
      fetch(`${baseUrl}/api/lots/${lot.id}/bids?limit=50`)
    ]);
    expect(detailResponse.status).toBe(200);
    expect(bidsResponse.status).toBe(200);

    const detail = (await detailResponse.json()) as {
      data: {
        currentBidCents: string;
        bidCount: number;
        isLeading: boolean;
        version: number;
      };
    };
    const history = (await bidsResponse.json()) as {
      data: Array<{ sequence: number; amountCents: string }>;
      meta: { total: number };
    };
    expect(detail.data).toMatchObject({
      currentBidCents: "12000",
      bidCount: 2,
      isLeading: false,
      version: 2
    });
    expect(history.meta.total).toBe(2);
    expect(history.data.map((bid) => bid.sequence).sort()).toEqual([1, 2]);
    expect(new Set(history.data.map((bid) => bid.sequence)).size).toBe(2);
  });
});
