import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.ts";
import { prisma, transaction } from "../../config/database.ts";
import { appendLedger } from "../audit/audit-ledger.service.ts";
import { bidHash } from "../audit/audit-crypto.ts";
import { sha256 } from "../../shared/crypto.ts";
import { AppError } from "../../shared/errors.ts";
import { withKeyLock } from "../../shared/locks.ts";
import { hitTestFault } from "../../shared/test-faults.ts";

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 20_000
} as const;

export async function placeBid(input: {
  lotId: string;
  bidderId: string;
  amountCents: bigint;
  key: string;
}) {
  const digest = sha256(JSON.stringify(["BID", input.lotId, input.amountCents.toString()]));
  const idempotencyWhere = {
    actorUserId_operation_key: {
      actorUserId: input.bidderId,
      operation: `BID:${input.lotId}`,
      key: input.key
    }
  } as const;
  const replay = (found: {
    requestDigest: string;
    status: string;
    responseBody: unknown;
    responseStatus: number | null;
  }) => {
    if (found.requestDigest !== digest) {
      throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Esta chave já foi usada em outra operação.");
    }
    if (found.status === "CONFIRMED") return found.responseBody;
    if (found.status === "PENDING") {
      throw new AppError("AUDIT_PENDING", 423, "Estamos verificando o resultado deste lance.");
    }
    const body = found.responseBody as { error?: string } | null;
    throw new AppError(
      body?.error ?? "BID_FAILED",
      found.responseStatus ?? 409,
      "A tentativa anterior falhou sem registrar o lance."
    );
  };

  const found = await prisma.idempotencyRecord.findUnique({ where: idempotencyWhere });
  if (found) return replay(found);
  const idemId = randomUUID();
  try {
    await prisma.idempotencyRecord.create({
      data: {
        id: idemId,
        actorUserId: input.bidderId,
        operation: `BID:${input.lotId}`,
        key: input.key,
        requestDigest: digest
      }
    });
  } catch (error) {
    const raced = await prisma.idempotencyRecord.findUnique({ where: idempotencyWhere });
    if (raced) return replay(raced);
    throw error;
  }

  return withKeyLock(`bid:${input.lotId}`, async () => {
    const operationId = randomUUID();
    let prepared: { sequence: number; hash: string } | undefined;
    let databaseCommitted = false;
    try {
      const persisted = await transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM lots WHERE id = ${input.lotId}::uuid FOR UPDATE`;
        const lot = await tx.lot.findUnique({
          where: { id: input.lotId },
          include: { currentLeader: { include: { wallet: true } } }
        });
        if (!lot) throw new AppError("RESOURCE_NOT_FOUND", 404, "Lote não encontrado.");
        if (lot.auditState !== "READY") {
          throw new AppError(
            lot.auditState === "COMPROMISED" ? "AUDIT_INTEGRITY_FAILED" : "AUDIT_PENDING",
            423,
            "A auditoria deste lote precisa ser reconciliada."
          );
        }
        const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
        const now = nowRows[0]!.now;
        if (lot.status === "CANCELLED") throw new AppError("LOT_CANCELLED", 409, "Este lote foi cancelado.");
        if (now < lot.startsAt || lot.status === "SCHEDULED") {
          throw new AppError("LOT_NOT_STARTED", 409, "Este leilão ainda não começou.");
        }
        if (now >= lot.effectiveEndsAt || lot.status === "ENDED") {
          throw new AppError("LOT_ENDED", 409, "Este leilão foi encerrado.");
        }
        if (lot.currentLeaderId === input.bidderId) {
          throw new AppError("ALREADY_LEADING", 409, "Você já está liderando este leilão.");
        }
        const minimum = lot.currentBidCents == null
          ? lot.startingBidCents
          : lot.currentBidCents + lot.minimumIncrementCents;
        if (input.amountCents < minimum) {
          throw new AppError("BID_BELOW_MINIMUM", 422, "O valor informado está abaixo do lance mínimo permitido.");
        }

        const bidderWallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.bidderId } });
        const walletIds = [bidderWallet.id, lot.currentLeader?.wallet?.id]
          .filter((value): value is string => Boolean(value))
          .sort();
        for (const walletId of walletIds) {
          await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${walletId}::uuid FOR UPDATE`;
        }
        const freshWallet = await tx.wallet.findUniqueOrThrow({ where: { id: bidderWallet.id } });
        if (freshWallet.totalCents - freshWallet.reservedCents < input.amountCents) {
          throw new AppError("INSUFFICIENT_BALANCE", 409, "Seu saldo disponível não é suficiente para este lance.");
        }

        let participant = await tx.lotParticipant.findUnique({
          where: { lotId_userId: { lotId: input.lotId, userId: input.bidderId } }
        });
        if (!participant) {
          const aggregate = await tx.lotParticipant.aggregate({
            where: { lotId: input.lotId },
            _max: { publicNumber: true }
          });
          participant = await tx.lotParticipant.create({
            data: {
              id: randomUUID(),
              lotId: input.lotId,
              userId: input.bidderId,
              publicNumber: (aggregate._max.publicNumber ?? 0) + 1
            }
          });
        }
        const previous = await tx.bid.findFirst({
          where: { lotId: input.lotId },
          orderBy: { sequence: "desc" }
        });
        const sequence = (previous?.sequence ?? 0) + 1;
        const previousHash = previous?.hash ?? lot.genesisHash!;
        const hash = bidHash({
          lotId: input.lotId,
          sequence,
          publicNumber: participant.publicNumber,
          amountCents: input.amountCents,
          acceptedAt: now,
          previousHash
        });
        prepared = { sequence, hash };
        await appendLedger({
          protocolVersion: "audit-v1",
          type: "BID_PREPARE",
          lotId: input.lotId,
          operationId,
          sequence,
          commitment: hash
        });
        hitTestFault("bid.after_prepare");

        if (lot.currentLeader?.wallet) {
          const oldHold = await tx.walletHold.findUnique({
            where: {
              walletId_lotId: { walletId: lot.currentLeader.wallet.id, lotId: input.lotId }
            }
          });
          if (oldHold?.status === "ACTIVE") {
            await tx.wallet.update({
              where: { id: oldHold.walletId },
              data: { reservedCents: { decrement: oldHold.amountCents } }
            });
            await tx.walletHold.update({
              where: { id: oldHold.id },
              data: { amountCents: 0n, status: "RELEASED", currentBidId: null }
            });
          }
        }

        const bidId = randomUUID();
        await tx.wallet.update({
          where: { id: freshWallet.id },
          data: { reservedCents: { increment: input.amountCents } }
        });
        const bid = await tx.bid.create({
          data: {
            id: bidId,
            lotId: input.lotId,
            bidderId: input.bidderId,
            participantId: participant.id,
            sequence,
            amountCents: input.amountCents,
            previousHash,
            hash,
            acceptedAt: now,
            idempotencyRecordId: idemId
          }
        });
        await tx.walletHold.upsert({
          where: { walletId_lotId: { walletId: freshWallet.id, lotId: input.lotId } },
          create: {
            id: randomUUID(),
            walletId: freshWallet.id,
            lotId: input.lotId,
            currentBidId: bidId,
            amountCents: input.amountCents,
            status: "ACTIVE"
          },
          update: { currentBidId: bidId, amountCents: input.amountCents, status: "ACTIVE" }
        });
        const extend = lot.effectiveEndsAt.getTime() - now.getTime() <= 120_000;
        const effectiveEndsAt = extend
          ? new Date(lot.effectiveEndsAt.getTime() + 120_000)
          : lot.effectiveEndsAt;
        const updatedLot = await tx.lot.update({
          where: { id: input.lotId },
          data: {
            currentBidCents: input.amountCents,
            currentLeaderId: input.bidderId,
            bidCount: { increment: 1 },
            version: { increment: 1 },
            effectiveEndsAt,
            auditState: "PENDING"
          }
        });
        return { bid, lot: updatedLot, participant, extended: extend };
      }, transactionOptions);

      databaseCommitted = true;
      hitTestFault("bid.after_database_commit");
      await appendLedger({
        protocolVersion: "audit-v1",
        type: "BID_COMMIT",
        lotId: input.lotId,
        operationId,
        sequence: persisted.bid.sequence,
        commitment: persisted.bid.hash
      });
      const response = {
        bidId: persisted.bid.id,
        lotId: input.lotId,
        sequence: persisted.bid.sequence,
        amountCents: persisted.bid.amountCents.toString(),
        nextMinimumCents: (persisted.bid.amountCents + persisted.lot.minimumIncrementCents).toString(),
        acceptedAt: persisted.bid.acceptedAt.toISOString(),
        effectiveEndsAt: persisted.lot.effectiveEndsAt.toISOString(),
        version: persisted.lot.version,
        isLeading: true,
        extended: persisted.extended,
        participant: `Licitante ${String(persisted.participant.publicNumber).padStart(2, "0")}`
      };
      await transaction(async (tx) => {
        await tx.lot.update({ where: { id: input.lotId }, data: { auditState: "READY" } });
        await tx.idempotencyRecord.update({
          where: { id: idemId },
          data: { status: "CONFIRMED", responseStatus: 201, responseBody: response }
        });
      });
      return response;
    } catch (error) {
      if (prepared && !databaseCommitted) {
        await appendLedger({
          protocolVersion: "audit-v1",
          type: "ABORT",
          lotId: input.lotId,
          operationId,
          sequence: prepared.sequence,
          commitment: prepared.hash
        }).catch(() => undefined);
      }
      const bidExists = await prisma.bid.findUnique({ where: { idempotencyRecordId: idemId } });
      if (!bidExists) {
        await prisma.idempotencyRecord.update({
          where: { id: idemId },
          data: {
            status: "FAILED",
            responseStatus: error instanceof AppError ? error.status : 500,
            responseBody: { error: error instanceof AppError ? error.code : "INTERNAL_ERROR" }
          }
        }).catch(() => undefined);
      }
      throw error;
    }
  });
}
