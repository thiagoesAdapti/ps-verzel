import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.ts";
import { closeSockets, createSocketServer, emitLot } from "../../src/realtime/socket.server.ts";

let server: HttpServer;
let baseUrl = "";
const clients: ClientSocket[] = [];

async function openClient() {
  const client = createClient(baseUrl, {
    path: "/socket.io",
    transports: ["websocket"],
    forceNew: true,
    reconnection: false
  });
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Socket nao conectou.")), 2_000);
    client.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    client.once("connect_error", reject);
  });
  return client;
}

beforeAll(async () => {
  server = createServer(app);
  createSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Porta de teste indisponivel.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  for (const client of clients) client.close();
  await closeSockets();
  if (server.listening) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("sincronizacao Socket.IO", () => {
  it("isola salas e publica somente dados publicos depois da confirmacao", async () => {
    const lotA = randomUUID();
    const lotB = randomUUID();
    const clientA = await openClient();
    const clientB = await openClient();
    expect(await clientA.timeout(1_000).emitWithAck("lot:join", { lotId: lotA }))
      .toEqual({ ok: true });
    expect(await clientB.timeout(1_000).emitWithAck("lot:join", { lotId: lotB }))
      .toEqual({ ok: true });

    let leaked = false;
    clientB.on("bid:accepted", () => {
      leaked = true;
    });
    const received = new Promise<Record<string, unknown>>((resolve) => {
      clientA.once("bid:accepted", resolve);
    });
    emitLot("bid:accepted", lotA, {
      sequence: 1,
      amountCents: "10000",
      participant: "Licitante 01"
    });
    const payload = await received;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(payload).toMatchObject({
      lotId: lotA,
      sequence: 1,
      amountCents: "10000",
      participant: "Licitante 01"
    });
    expect(JSON.stringify(payload)).not.toMatch(/email|name|userId|bidderId/i);
    expect(leaked).toBe(false);
  });

  it("volta a receber eventos depois de reconectar e reentrar na sala", async () => {
    const lotId = randomUUID();
    const client = await openClient();
    await client.timeout(1_000).emitWithAck("lot:join", { lotId });
    client.disconnect();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Socket nao reconectou.")), 2_000);
      client.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      client.connect();
    });
    await client.timeout(1_000).emitWithAck("lot:join", { lotId });

    const received = new Promise<Record<string, unknown>>((resolve) => {
      client.once("lot:extended", resolve);
    });
    emitLot("lot:extended", lotId, { effectiveEndsAt: new Date().toISOString(), version: 2 });
    expect(await received).toMatchObject({ lotId, version: 2 });
  });

  it("rejeita identificador de sala invalido", async () => {
    const client = await openClient();
    expect(await client.timeout(1_000).emitWithAck("lot:join", { lotId: "../segredo" }))
      .toEqual({ ok: false });
  });
});
