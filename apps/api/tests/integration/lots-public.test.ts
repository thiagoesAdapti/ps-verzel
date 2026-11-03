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

async function publish(label: string, startsInMs = 0, endsInMs = 600_000) {
  const startsImmediately = startsInMs === 0;
  const response = await sellerAgent
    .post("/api/lots")
    .set("Origin", env.APP_ORIGIN)
    .send({
      catalogToken: createCatalogToken({
        key: `/works/${label}-${randomUUID()}`,
        title: `Livro ${label}`,
        authors: ["Autoria pública"],
        publicationYear: 2026,
        publisher: "Editora pública",
        coverId: null
      }, sellerId),
      description: `Exemplar usado na consulta pública do lote ${label}.`,
      condition: "GOOD",
      startingBidCents: "10000",
      minimumIncrementCents: "2000",
      startsImmediately,
      ...(startsImmediately ? {} : { startsAt: new Date(Date.now() + startsInMs).toISOString() }),
      endsAt: new Date(Date.now() + endsInMs).toISOString()
    });
  expect(response.status).toBe(201);
  ledgers.add(response.body.data.id);
  return response.body.data as { id: string };
}

beforeAll(async () => {
  await resetTestDatabase();
  sellerAgent = request.agent(app);
  const registered = await sellerAgent
    .post("/api/auth/register")
    .set("Origin", env.APP_ORIGIN)
    .send({
      name: "Leiloeira pública",
      email: "seller-public@integration.local",
      password: "SenhaSegura123",
      role: "AUCTIONEER"
    });
  sellerId = registered.body.data.id;
  await sellerAgent
    .post("/api/auth/login")
    .set("Origin", env.APP_ORIGIN)
    .send({ email: "seller-public@integration.local", password: "SenhaSegura123" });
});

afterAll(async () => {
  await cleanupTestArtifacts();
  await Promise.all([...ledgers].map((lotId) => unlink(resolve(env.auditDir, `${lotId}.jsonl`)).catch(() => undefined)));
});

describe("public lot queries", () => {
  it("orders the catalog before pagination, filters statuses, and hides non-public lots", async () => {
    const liveEarly = await publish("live-cedo", 0, 180_000);
    const liveLate = await publish("live-tarde", 0, 360_000);
    const scheduledEarly = await publish("agendado-cedo", 120_000, 480_000);
    const scheduledLate = await publish("agendado-tarde", 240_000, 600_000);
    const endedRecent = await publish("encerrado-recente");
    const endedOld = await publish("encerrado-antigo");
    const cancelled = await publish("cancelado", 300_000, 900_000);
    const pending = await publish("pendente", 400_000, 1_000_000);
    await Promise.all([
      prisma.lot.update({
        where: { id: endedRecent.id },
        data: {
          status: "ENDED",
          startsAt: new Date(Date.now() - 600_000),
          originalEndsAt: new Date(Date.now() - 60_000),
          effectiveEndsAt: new Date(Date.now() - 60_000)
        }
      }),
      prisma.lot.update({
        where: { id: endedOld.id },
        data: {
          status: "ENDED",
          startsAt: new Date(Date.now() - 900_000),
          originalEndsAt: new Date(Date.now() - 300_000),
          effectiveEndsAt: new Date(Date.now() - 300_000)
        }
      }),
      prisma.lot.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } }),
      prisma.lot.update({ where: { id: pending.id }, data: { auditState: "PENDING" } })
    ]);

    const pages = await Promise.all([
      request(app).get("/api/lots?page=1&limit=2"),
      request(app).get("/api/lots?page=2&limit=2"),
      request(app).get("/api/lots?page=3&limit=2")
    ]);
    const allIds = pages.flatMap((response) => response.body.data.map((lot: { id: string }) => lot.id));
    expect(allIds).toEqual([
      liveEarly.id,
      liveLate.id,
      scheduledEarly.id,
      scheduledLate.id,
      endedRecent.id,
      endedOld.id
    ]);
    expect(pages[0]!.body.meta).toEqual({ page: 1, limit: 2, total: 6, totalPages: 3 });

    const live = await request(app).get("/api/lots?status=LIVE&limit=50");
    const scheduled = await request(app).get("/api/lots?status=SCHEDULED&limit=50");
    const ended = await request(app).get("/api/lots?status=ENDED&limit=50");
    expect(live.body.data.map((lot: { id: string }) => lot.id)).toEqual([liveEarly.id, liveLate.id]);
    expect(scheduled.body.data.map((lot: { id: string }) => lot.id)).toEqual([scheduledEarly.id, scheduledLate.id]);
    expect(ended.body.data.map((lot: { id: string }) => lot.id)).toEqual([endedRecent.id, endedOld.id]);

    expect((await request(app).get(`/api/lots/${cancelled.id}`)).status).toBe(404);
    expect((await sellerAgent.get(`/api/lots/${cancelled.id}`)).status).toBe(200);

    const detail = await request(app).get(`/api/lots/${liveEarly.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      id: liveEarly.id,
      startingBidCents: "10000",
      minimumIncrementCents: "2000",
      nextMinimumCents: "10000",
      position: null,
      isLeading: false
    });
    expect(Date.parse(detail.body.data.serverNow)).not.toBeNaN();
    expect(detail.body.data).not.toHaveProperty("sellerId");
    expect(detail.body.data).not.toHaveProperty("email");
  });
});
