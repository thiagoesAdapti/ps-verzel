import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../../config/database.ts";
import { env } from "../../config/env.ts";
import { AppError } from "../../shared/errors.ts";
import { jsonMoney } from "../../shared/money.ts";
import { genesisHash } from "../audit/audit-crypto.ts";
import { appendLedger } from "../audit/audit-ledger.service.ts";
import type { CatalogBook } from "../catalog/catalog.service.ts";

export async function saveCover(coverId: number | null, lotId: string) {
  if (!coverId) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const coverBaseUrl = env.OPEN_LIBRARY_COVERS_URL.replace(/\/$/, "");
    const response = await fetch(`${coverBaseUrl}/b/id/${coverId}-L.jpg?default=false`, {
      signal: controller.signal
    });
    const type = response.headers.get("content-type") ?? "";
    const size = Number(response.headers.get("content-length") ?? 0);
    if (!response.ok || !["image/jpeg", "image/png"].includes(type) || size > 3_000_000) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 3_000_000) return null;
    const filename = `${lotId}.${type === "image/png" ? "png" : "jpg"}`;
    await mkdir(env.coverDir, { recursive: true });
    await writeFile(resolve(env.coverDir, filename), bytes, { flag: "wx" });
    return filename;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function createLot(input: {
  sellerId: string;
  book: CatalogBook;
  description: string;
  condition: "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
  startingBidCents: bigint;
  minimumIncrementCents: bigint;
  startsAt: Date;
  endsAt: Date;
}) {
  const lotId = randomUUID();
  const operationId = randomUUID();
  const hash = genesisHash({
    lotId,
    sellerId: input.sellerId,
    startingBidCents: input.startingBidCents,
    minimumIncrementCents: input.minimumIncrementCents,
    startsAt: input.startsAt,
    originalEndsAt: input.endsAt
  });
  const coverLocalPath = await saveCover(input.book.coverId, lotId);
  await appendLedger({
    protocolVersion: "audit-v1",
    type: "GENESIS_PREPARE",
    lotId,
    operationId,
    sequence: 0,
    commitment: hash
  });
  try {
    await prisma.lot.create({
      data: {
        id: lotId,
        sellerId: input.sellerId,
        externalKey: input.book.key,
        title: input.book.title,
        authors: input.book.authors,
        publisher: input.book.publisher,
        publicationYear: input.book.publicationYear,
        sourceSnapshot: input.book,
        coverLocalPath,
        description: input.description,
        condition: input.condition,
        startingBidCents: input.startingBidCents,
        minimumIncrementCents: input.minimumIncrementCents,
        startsAt: input.startsAt,
        originalEndsAt: input.endsAt,
        effectiveEndsAt: input.endsAt,
        status: input.startsAt <= new Date() ? "LIVE" : "SCHEDULED",
        auditState: "PENDING",
        genesisHash: hash
      }
    });
  } catch (error) {
    await appendLedger({
      protocolVersion: "audit-v1",
      type: "ABORT",
      lotId,
      operationId,
      sequence: 0,
      commitment: hash
    }).catch(() => undefined);
    throw error;
  }
  try {
    await appendLedger({
      protocolVersion: "audit-v1",
      type: "GENESIS_COMMIT",
      lotId,
      operationId,
      sequence: 0,
      commitment: hash
    });
    return await prisma.lot.update({ where: { id: lotId }, data: { auditState: "READY" } });
  } catch {
    throw new AppError("AUDIT_PENDING", 423, "O lote foi salvo e aguarda confirmação da auditoria.");
  }
}

export function serializeLot(
  lot: any,
  participant?: { publicNumber: number; userId: string } | null,
  position?: number | null
) {
  const leader = lot.currentLeader && lot.participants
    ? lot.participants.find((candidate: any) => candidate.userId === lot.currentLeaderId)
    : null;
  return {
    id: lot.id,
    title: lot.title,
    authors: lot.authors,
    publisher: lot.publisher,
    publicationYear: lot.publicationYear,
    coverUrl: lot.coverLocalPath ? `/api/covers/${lot.coverLocalPath}` : null,
    description: lot.description,
    condition: lot.condition,
    startingBidCents: jsonMoney(lot.startingBidCents),
    minimumIncrementCents: jsonMoney(lot.minimumIncrementCents),
    currentBidCents: jsonMoney(lot.currentBidCents),
    nextMinimumCents: (lot.currentBidCents == null
      ? lot.startingBidCents
      : lot.currentBidCents + lot.minimumIncrementCents).toString(),
    startsAt: lot.startsAt.toISOString(),
    originalEndsAt: lot.originalEndsAt.toISOString(),
    effectiveEndsAt: lot.effectiveEndsAt.toISOString(),
    status: lot.status,
    auditState: lot.auditState,
    bidCount: lot.bidCount,
    version: lot.version,
    leader: leader ? `Licitante ${String(leader.publicNumber).padStart(2, "0")}` : null,
    serverNow: new Date().toISOString(),
    isLeading: Boolean(participant && participant.userId === lot.currentLeaderId),
    position: position ?? null
  };
}
