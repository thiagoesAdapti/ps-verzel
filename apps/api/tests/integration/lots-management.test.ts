import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.ts";
import { prisma } from "../../src/config/database.ts";
import { env } from "../../src/config/env.ts";
import { createCatalogToken } from "../../src/modules/catalog/catalog.service.ts";
import { cleanupTestArtifacts, resetTestDatabase } from "../helpers/integration.ts";

const ledgers = new Set<string>();
let sellerId = "";
let sellerAgent: ReturnType<typeof request.agent>;
let outsiderAgent: ReturnType<typeof request.agent>;

async function registerAuctioneer(
  agent: ReturnType<typeof request.agent>,
  name: string,
  email: string
) {
  const registered = await agent
    .post("/api/auth/register")
    .set("Origin", env.APP_ORIGIN)
    .send({ name, email, password: "SenhaSegura123", role: "AUCTIONEER" });
  await agent
    .post("/api/auth/login")
    .set("Origin", env.APP_ORIGIN)
    .send({ email, password: "SenhaSegura123" });
  return registered.body.data.id as string;
}

async function publish(
  agent: ReturnType<typeof request.agent>,
  ownerId: string,
  label: string,
  startsInMs = 0,
  endsInMs = 600_000
) {
  const startsImmediately = startsInMs === 0;
  const response = await agent
    .post("/api/lots")
    .set("Origin", env.APP_ORIGIN)
    .send({
      catalogToken: createCatalogToken({
        key: `/works/${label}-${randomUUID()}`,
        title: `Livro ${label}`,
        authors: ["Autoria de integração"],
        publicationYear: 2026,
        publisher: "Editora de integração",
        coverId: null
      }, ownerId),
      description: `Exemplar usado na gestão integrada do lote ${label}.`,
      condition: "GOOD",
      startingBidCents: "10000",
      minimumIncrementCents: "2000",
      startsImmediately,
      ...(startsImmediately ? {} : { startsAt: new Date(Date.now() + startsInMs).toISOString() }),
      endsAt: new Date(Date.now() + endsInMs).toISOString()
    });
  expect(response.status).toBe(201);
  ledgers.add(response.body.data.id);
  return response.body.data as { id: string; version: number };
}

beforeAll(async () => {
  await resetTestDatabase();
  sellerAgent = request.agent(app);
  outsiderAgent = request.agent(app);
  sellerId = await registerAuctioneer(
    sellerAgent,
    "Leiloeira gestora",
    "seller-management@integration.local"
  );
  await registerAuctioneer(
    outsiderAgent,
    "Leiloeira externa",
    "outsider-management@integration.local"
  );
});

afterAll(async () => {
  await cleanupTestArtifacts();
  await Promise.all([...ledgers].map((lotId) => unlink(resolve(env.auditDir, `${lotId}.jsonl`)).catch(() => undefined)));
});

describe("auctioneer lot management", () => {
  it("locks and cancels only an eligible lot owned by the authenticated auctioneer", async () => {
    const cancellable = await publish(sellerAgent, sellerId, "cancelável", 120_000);
    const foreignAttempt = await outsiderAgent
      .post(`/api/lots/${cancellable.id}/cancel`)
      .set("Origin", env.APP_ORIGIN);
    expect(foreignAttempt.status).toBe(403);

    const cancelled = await sellerAgent
      .post(`/api/lots/${cancellable.id}/cancel`)
      .set("Origin", env.APP_ORIGIN);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data).toMatchObject({
      id: cancellable.id,
      status: "CANCELLED",
      version: cancellable.version + 1
    });

    const ended = await publish(sellerAgent, sellerId, "encerrado");
    await prisma.lot.update({ where: { id: ended.id }, data: { status: "ENDED" } });
    const rejected = await sellerAgent
      .post(`/api/lots/${ended.id}/cancel`)
      .set("Origin", env.APP_ORIGIN);
    expect(rejected.status).toBe(409);
    expect(rejected.body.error).toMatchObject({ code: "LOT_CANNOT_BE_CANCELLED" });
  });

  it("orders before pagination and computes summary metrics over all owned lots", async () => {
    const live = await publish(sellerAgent, sellerId, "ao-vivo");
    const scheduledEarly = await publish(sellerAgent, sellerId, "agendado-cedo", 120_000, 900_000);
    const scheduledLate = await publish(sellerAgent, sellerId, "agendado-tarde", 240_000, 1_000_000);

    const response = await sellerAgent.get("/api/auctioneer/lots?page=2&limit=2");
    expect(response.status).toBe(200);
    expect(response.body.data.map((lot: { id: string }) => lot.id)).toEqual([
      scheduledLate.id,
      expect.any(String)
    ]);
    expect(response.body.data[1].status).toBe("ENDED");
    expect(response.body.summary).toEqual({ total: 5, live: 1, receivedCents: "0" });
    expect(response.body.meta).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });

    const firstPage = await sellerAgent.get("/api/auctioneer/lots?page=1&limit=2");
    expect(firstPage.body.data.map((lot: { id: string }) => lot.id)).toEqual([
      live.id,
      scheduledEarly.id
    ]);
  });
});
