import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.ts";
import { prisma } from "../../src/config/database.ts";
import { verifyLotAudit } from "../../src/modules/audit/audit.service.ts";
import { placeBid } from "../../src/modules/bids/bids.service.ts";
import {
  cleanupTestArtifacts,
  createTestBidder,
  createTestLot,
  createTestUser,
  ledgerPath,
  resetTestDatabase
} from "../helpers/integration.ts";

beforeEach(resetTestDatabase);
afterAll(cleanupTestArtifacts);

async function lotWithBids(label: string, count: 1 | 2 | 3 = 2) {
  const seller = await createTestUser(`${label}-seller`, "AUCTIONEER");
  const lot = await createTestLot({ sellerId: seller.id, label });
  const bidders = await Promise.all([
    createTestBidder(`${label}-one`),
    createTestBidder(`${label}-two`),
    createTestBidder(`${label}-three`)
  ]);
  for (let index = 0; index < count; index += 1) {
    await placeBid({
      lotId: lot.id,
      bidderId: bidders[index]!.id,
      amountCents: 10_000n + BigInt(index) * 2_000n,
      key: randomUUID()
    });
  }
  const bids = await prisma.bid.findMany({
    where: { lotId: lot.id },
    include: { participant: true },
    orderBy: { sequence: "asc" }
  });
  return { lot, bidders, bids };
}

describe("verificacao publica independente", () => {
  it("recalcula um historico integro e publica apenas pseudonimos", async () => {
    const { lot, bidders } = await lotWithBids("intact", 2);
    const result = await verifyLotAudit(lot.id);
    expect(result).toMatchObject({
      lotId: lot.id,
      status: "INTEGRO",
      bidCount: 2,
      algorithm: "SHA-256 + Ed25519"
    });
    expect(result.bids.map((bid: { participant: string }) => bid.participant))
      .toEqual(["Licitante 01", "Licitante 02"]);
    const response = await request(app).get(`/api/lots/${lot.id}/audit`).expect(200);
    const payload = JSON.stringify(response.body);
    for (const bidder of bidders) {
      expect(payload).not.toContain(bidder.id);
      expect(payload).not.toContain(bidder.email);
    }
    expect(payload).not.toMatch(/userId|bidderId/i);
  });

  it("detecta alteracao de participante, sequencia e dados genesis", async () => {
    const participantCase = await lotWithBids("participant", 2);
    await prisma.bid.update({
      where: { id: participantCase.bids[0]!.id },
      data: { participantId: participantCase.bids[1]!.participantId }
    });
    expect(await verifyLotAudit(participantCase.lot.id)).toMatchObject({ status: "ADULTERADO" });

    const sequenceCase = await lotWithBids("sequence", 2);
    await prisma.bid.update({ where: { id: sequenceCase.bids[1]!.id }, data: { sequence: 9 } });
    expect(await verifyLotAudit(sequenceCase.lot.id)).toMatchObject({ status: "ADULTERADO" });

    const genesisCase = await lotWithBids("genesis", 1);
    await prisma.lot.update({
      where: { id: genesisCase.lot.id },
      data: { startingBidCents: { increment: 1n } }
    });
    expect(await verifyLotAudit(genesisCase.lot.id)).toMatchObject({ status: "ADULTERADO" });
  });

  it("detecta insercao, exclusao e divergencia do lider", async () => {
    const insertionCase = await lotWithBids("insertion", 1);
    const first = insertionCase.bids[0]!;
    await prisma.bid.create({
      data: {
        id: randomUUID(),
        lotId: insertionCase.lot.id,
        bidderId: first.bidderId,
        participantId: first.participantId,
        sequence: 2,
        amountCents: 12_000n,
        previousHash: first.hash,
        hash: "f".repeat(64),
        acceptedAt: new Date()
      }
    });
    expect(await verifyLotAudit(insertionCase.lot.id)).toMatchObject({ status: "ADULTERADO" });

    const deletionCase = await lotWithBids("deletion", 3);
    await prisma.bid.delete({ where: { id: deletionCase.bids[1]!.id } });
    expect(await verifyLotAudit(deletionCase.lot.id)).toMatchObject({ status: "ADULTERADO" });

    const leaderCase = await lotWithBids("leader", 2);
    await prisma.lot.update({ where: { id: leaderCase.lot.id }, data: { currentLeaderId: null } });
    expect(await verifyLotAudit(leaderCase.lot.id)).toMatchObject({ status: "ADULTERADO" });
  });

  it("detecta assinatura externa adulterada", async () => {
    const { lot } = await lotWithBids("signature", 1);
    const path = ledgerPath(lot.id);
    const records = (await readFile(path, "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const signature = String(records[1]!.signature);
    records[1]!.signature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    await writeFile(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
    expect(await verifyLotAudit(lot.id)).toMatchObject({ status: "ADULTERADO" });
  });

  it("retorna inconclusivo quando o ledger esta inacessivel", async () => {
    const { lot } = await lotWithBids("inaccessible", 1);
    const path = ledgerPath(lot.id);
    const backup = `${path}.backup`;
    await rename(path, backup);
    await mkdir(path);
    try {
      expect(await verifyLotAudit(lot.id)).toMatchObject({ status: "INCONCLUSIVO" });
    } finally {
      await rm(path, { recursive: true, force: true });
      await rename(backup, path);
    }
  });
});
