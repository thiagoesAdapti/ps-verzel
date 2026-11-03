import { prisma, transaction } from "../../config/database.ts";
import { AppError } from "../../shared/errors.ts";
import { bidHash, genesisHash, publicKeyBase64 } from "./audit-crypto.ts";
import { appendLedger, readLedger, validateLedger } from "./audit-ledger.service.ts";

export async function verifyLotAudit(lotId: string) {
  const verifiedAt = new Date().toISOString();
  let records;
  try {
    records = await readLedger(lotId);
  } catch {
    return {
      lotId,
      status: "INCONCLUSIVO",
      bidCount: 0,
      verifiedAt,
      algorithm: "SHA-256 + Ed25519",
      message: "Não foi possível verificar completamente este histórico.",
      proof: { genesisHash: null, latestHash: null, publicKey: publicKeyBase64 },
      bids: []
    };
  }
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    include: {
      bids: { include: { participant: true }, orderBy: { sequence: "asc" } }
    }
  });
  if (!lot && records.length === 0) {
    throw new AppError("RESOURCE_NOT_FOUND", 404, "Lote não encontrado.");
  }
  if (!validateLedger(records) || records.some((record) => record.lotId !== lotId)) {
    return auditResult(
      "ADULTERADO",
      "Foram identificadas divergências no histórico de lances.",
      lot,
      records,
      verifiedAt
    );
  }
  const genesisPrepare = records.find((record) => record.type === "GENESIS_PREPARE");
  const genesisCommit = records.find((record) => (
    record.type === "GENESIS_COMMIT"
    && record.operationId === genesisPrepare?.operationId
    && record.commitment === genesisPrepare.commitment
  ));
  const openOperations = records
    .filter((record) => record.type.endsWith("PREPARE"))
    .filter((prepare) => !records.some((record) => (
      record.operationId === prepare.operationId
      && (record.type.endsWith("COMMIT") || record.type === "ABORT")
    )));
  if (!genesisPrepare || !genesisCommit || openOperations.length > 0) {
    return auditResult(
      "INCONCLUSIVO",
      "Não foi possível verificar completamente este histórico.",
      lot,
      records,
      verifiedAt
    );
  }
  if (!lot || lot.genesisHash !== genesisPrepare.commitment) {
    return auditResult(
      "ADULTERADO",
      "Foram identificadas divergências no histórico de lances.",
      lot,
      records,
      verifiedAt
    );
  }
  const recalculatedGenesis = genesisHash({
    lotId: lot.id,
    sellerId: lot.sellerId,
    startingBidCents: lot.startingBidCents,
    minimumIncrementCents: lot.minimumIncrementCents,
    startsAt: lot.startsAt,
    originalEndsAt: lot.originalEndsAt
  });
  if (recalculatedGenesis !== lot.genesisHash) {
    return auditResult(
      "ADULTERADO",
      "Os dados originais do lote divergem da prova de genesis.",
      lot,
      records,
      verifiedAt
    );
  }
  const commits = records
    .filter((record) => record.type === "BID_COMMIT")
    .sort((left, right) => left.sequence - right.sequence);
  const commitWithoutPrepare = commits.some((commit) => !records.some((record) => (
    record.type === "BID_PREPARE"
    && record.operationId === commit.operationId
    && record.sequence === commit.sequence
    && record.commitment === commit.commitment
  )));
  if (commitWithoutPrepare || commits.length !== lot.bids.length || lot.bidCount !== lot.bids.length) {
    return auditResult(
      "ADULTERADO",
      "Foram identificadas divergências no histórico de lances.",
      lot,
      records,
      verifiedAt
    );
  }
  let previousHash = lot.genesisHash;
  for (let index = 0; index < lot.bids.length; index += 1) {
    const bid = lot.bids[index]!;
    const commit = commits[index];
    const recalculated = bidHash({
      lotId,
      sequence: bid.sequence,
      publicNumber: bid.participant.publicNumber,
      amountCents: bid.amountCents,
      acceptedAt: bid.acceptedAt,
      previousHash
    });
    if (
      !commit
      || bid.sequence !== index + 1
      || bid.bidderId !== bid.participant.userId
      || bid.previousHash !== previousHash
      || bid.hash !== recalculated
      || commit.commitment !== bid.hash
      || commit.sequence !== bid.sequence
    ) {
      return auditResult(
        "ADULTERADO",
        "Foram identificadas divergências no histórico de lances.",
        lot,
        records,
        verifiedAt
      );
    }
    previousHash = bid.hash;
  }
  const latestBid = lot.bids.at(-1);
  if (
    (latestBid?.amountCents ?? null) !== lot.currentBidCents
    || (latestBid?.bidderId ?? null) !== lot.currentLeaderId
  ) {
    return auditResult(
      "ADULTERADO",
      "Foram identificadas divergências no histórico de lances.",
      lot,
      records,
      verifiedAt
    );
  }
  return auditResult(
    "INTEGRO",
    "O histórico não apresenta divergências nas provas verificadas.",
    lot,
    records,
    verifiedAt
  );
}

function auditResult(
  status: "INTEGRO" | "ADULTERADO" | "INCONCLUSIVO",
  message: string,
  lot: any,
  records: any[],
  verifiedAt: string
) {
  return {
    lotId: lot?.id ?? records[0]?.lotId,
    status,
    bidCount: lot?.bids?.length ?? 0,
    verifiedAt,
    algorithm: "SHA-256 + Ed25519",
    message,
    proof: {
      genesisHash: lot?.genesisHash
        ?? records.find((record) => record.type === "GENESIS_PREPARE")?.commitment
        ?? null,
      latestHash: lot?.bids?.at(-1)?.hash ?? lot?.genesisHash ?? null,
      publicKey: publicKeyBase64
    },
    bids: (lot?.bids ?? []).map((bid: any) => ({
      sequence: bid.sequence,
      participant: `Licitante ${String(bid.participant.publicNumber).padStart(2, "0")}`,
      amountCents: bid.amountCents.toString(),
      acceptedAt: bid.acceptedAt.toISOString(),
      previousHash: bid.previousHash,
      hash: bid.hash
    }))
  };
}

export async function recoverPendingAudits() {
  const lots = await prisma.lot.findMany({
    where: { auditState: "PENDING" },
    include: { bids: { orderBy: { sequence: "desc" }, take: 1 } }
  });
  for (const lot of lots) {
    try {
      const records = await readLedger(lot.id);
      if (!validateLedger(records)) {
        await prisma.lot.update({ where: { id: lot.id }, data: { auditState: "COMPROMISED" } });
        continue;
      }
      const prepare = records
        .filter((record) => record.type.endsWith("PREPARE"))
        .findLast((candidate) => !records.some((record) => (
          record.operationId === candidate.operationId
          && (record.type.endsWith("COMMIT") || record.type === "ABORT")
        )));
      if (!prepare) {
        const bid = lot.bids[0];
        if (bid?.idempotencyRecordId) {
          const idem = await prisma.idempotencyRecord.findUnique({
            where: { id: bid.idempotencyRecordId }
          });
          const hasCommit = records.some((record) => (
            record.type === "BID_COMMIT" && record.commitment === bid.hash
          ));
          if (idem?.status === "PENDING" && hasCommit) {
            const response = bidResponse(lot, bid);
            await prisma.idempotencyRecord.update({
              where: { id: idem.id },
              data: { status: "CONFIRMED", responseStatus: 201, responseBody: response }
            });
          }
        }
        await prisma.lot.update({ where: { id: lot.id }, data: { auditState: "READY" } });
        continue;
      }
      if (prepare.type === "GENESIS_PREPARE" && lot.genesisHash === prepare.commitment) {
        await appendLedger({
          protocolVersion: "audit-v1",
          type: "GENESIS_COMMIT",
          lotId: lot.id,
          operationId: prepare.operationId,
          sequence: 0,
          commitment: prepare.commitment
        });
        await prisma.lot.update({ where: { id: lot.id }, data: { auditState: "READY" } });
      } else if (
        prepare.type === "BID_PREPARE"
        && lot.bids[0]?.hash === prepare.commitment
        && lot.bids[0].sequence === prepare.sequence
      ) {
        await appendLedger({
          protocolVersion: "audit-v1",
          type: "BID_COMMIT",
          lotId: lot.id,
          operationId: prepare.operationId,
          sequence: prepare.sequence,
          commitment: prepare.commitment
        });
        const bid = lot.bids[0];
        const response = bidResponse(lot, bid);
        await transaction(async (tx) => {
          await tx.lot.update({ where: { id: lot.id }, data: { auditState: "READY" } });
          if (bid.idempotencyRecordId) {
            await tx.idempotencyRecord.update({
              where: { id: bid.idempotencyRecordId },
              data: { status: "CONFIRMED", responseStatus: 201, responseBody: response }
            });
          }
        });
      } else {
        await prisma.lot.update({ where: { id: lot.id }, data: { auditState: "INCONCLUSIVE" } });
      }
    } catch {
      await prisma.lot.update({
        where: { id: lot.id },
        data: { auditState: "INCONCLUSIVE" }
      }).catch(() => undefined);
    }
  }
}

function bidResponse(
  lot: {
    id: string;
    minimumIncrementCents: bigint;
    effectiveEndsAt: Date;
    version: number;
    currentLeaderId: string | null;
  },
  bid: {
    id: string;
    bidderId: string;
    sequence: number;
    amountCents: bigint;
    acceptedAt: Date;
  }
) {
  return {
    bidId: bid.id,
    lotId: lot.id,
    sequence: bid.sequence,
    amountCents: bid.amountCents.toString(),
    nextMinimumCents: (bid.amountCents + lot.minimumIncrementCents).toString(),
    acceptedAt: bid.acceptedAt.toISOString(),
    effectiveEndsAt: lot.effectiveEndsAt.toISOString(),
    version: lot.version,
    isLeading: lot.currentLeaderId === bid.bidderId
  };
}
