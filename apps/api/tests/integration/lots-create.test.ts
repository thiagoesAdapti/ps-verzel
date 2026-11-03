import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.ts";
import { prisma } from "../../src/config/database.ts";
import { env } from "../../src/config/env.ts";
import { readLedger, validateLedger } from "../../src/modules/audit/audit-ledger.service.ts";
import { createCatalogToken } from "../../src/modules/catalog/catalog.service.ts";
import { cleanupTestArtifacts, resetTestDatabase } from "../helpers/integration.ts";

const ledgers = new Set<string>();
let auctioneerId = "";
let auctioneerAgent: ReturnType<typeof request.agent>;

function tokenFor(label: string) {
  return createCatalogToken({
    key: `/works/${label}-${randomUUID()}`,
    title: `Livro ${label}`,
    authors: ["Autoria de integração"],
    publicationYear: 2026,
    publisher: "Editora de integração",
    coverId: null
  }, auctioneerId);
}

function lotPayload(catalogToken: string) {
  return {
    catalogToken,
    description: "Exemplar usado na validação integrada da publicação do lote.",
    condition: "GOOD",
    startingBidCents: "10000",
    minimumIncrementCents: "2000",
    startsImmediately: true,
    endsAt: new Date(Date.now() + 600_000).toISOString()
  };
}

beforeAll(async () => {
  await resetTestDatabase();
  auctioneerAgent = request.agent(app);
  const registered = await auctioneerAgent
    .post("/api/auth/register")
    .set("Origin", env.APP_ORIGIN)
    .send({
      name: "Leiloeira de integração",
      email: "auctioneer-lots@integration.local",
      password: "SenhaSegura123",
      role: "AUCTIONEER"
    });
  auctioneerId = registered.body.data.id;
  await auctioneerAgent
    .post("/api/auth/login")
    .set("Origin", env.APP_ORIGIN)
    .send({ email: "auctioneer-lots@integration.local", password: "SenhaSegura123" });
});

afterAll(async () => {
  await cleanupTestArtifacts();
  await Promise.all([...ledgers].map((lotId) => unlink(resolve(env.auditDir, `${lotId}.jsonl`)).catch(() => undefined)));
});

describe("audited lot creation", () => {
  it("publishes an immediate lot only after the genesis commit", async () => {
    const requestedBefore = Date.now();
    const response = await auctioneerAgent
      .post("/api/lots")
      .set("Origin", env.APP_ORIGIN)
      .send(lotPayload(tokenFor("imediato")));
    const requestedAfter = Date.now();

    expect(response.status).toBe(201);
    ledgers.add(response.body.data.id);
    expect(response.body.data).toMatchObject({ status: "LIVE", auditState: "READY", title: "Livro imediato" });
    expect(Date.parse(response.body.data.startsAt)).toBeGreaterThanOrEqual(requestedBefore);
    expect(Date.parse(response.body.data.startsAt)).toBeLessThanOrEqual(requestedAfter);

    const stored = await prisma.lot.findUniqueOrThrow({ where: { id: response.body.data.id } });
    const records = await readLedger(stored.id);
    expect(stored.auditState).toBe("READY");
    expect(records.map((record) => record.type)).toEqual(["GENESIS_PREPARE", "GENESIS_COMMIT"]);
    expect(records.every((record) => record.commitment === stored.genesisHash)).toBe(true);
    expect(validateLedger(records)).toBe(true);
  });

  it("preserves a valid future schedule", async () => {
    const startsAt = new Date(Date.now() + 600_000).toISOString();
    const endsAt = new Date(Date.now() + 1_200_000).toISOString();
    const response = await auctioneerAgent
      .post("/api/lots")
      .set("Origin", env.APP_ORIGIN)
      .send({
        ...lotPayload(tokenFor("agendado")),
        startsImmediately: false,
        startsAt,
        endsAt
      });

    expect(response.status).toBe(201);
    ledgers.add(response.body.data.id);
    expect(response.body.data).toMatchObject({ status: "SCHEDULED", startsAt, originalEndsAt: endsAt });
  });

  it("rejects invalid schedules without persisting a lot", async () => {
    const before = await prisma.lot.count({ where: { sellerId: auctioneerId } });
    const future = new Date(Date.now() + 600_000).toISOString();
    const earlier = new Date(Date.now() + 300_000).toISOString();
    const past = new Date(Date.now() - 600_000).toISOString();

    const reversed = await auctioneerAgent
      .post("/api/lots")
      .set("Origin", env.APP_ORIGIN)
      .send({ ...lotPayload(tokenFor("invertido")), startsImmediately: false, startsAt: future, endsAt: earlier });
    const expired = await auctioneerAgent
      .post("/api/lots")
      .set("Origin", env.APP_ORIGIN)
      .send({ ...lotPayload(tokenFor("passado")), startsImmediately: false, startsAt: past, endsAt: future });

    expect(reversed.status).toBe(422);
    expect(expired.status).toBe(422);
    expect(await prisma.lot.count({ where: { sellerId: auctioneerId } })).toBe(before);
  });
});
