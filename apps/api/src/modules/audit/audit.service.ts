import { prisma, transaction } from "../../config/database.ts";
import { appendLedger, readLedger, validateLedger } from "./audit-ledger.service.ts";

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
