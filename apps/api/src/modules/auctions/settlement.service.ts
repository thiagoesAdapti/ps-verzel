import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.ts";
import { prisma, transaction } from "../../config/database.ts";
import { randomToken } from "../../shared/crypto.ts";
import { AppError } from "../../shared/errors.ts";
import { hitProcessTestFault } from "../../shared/test-faults.ts";

const options = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 20_000
} as const;

export async function settleLot(lotId: string) {
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM lots WHERE id = ${lotId}::uuid FOR UPDATE`;
    const lot = await tx.lot.findUnique({ where: { id: lotId } });
    if (!lot) throw new AppError("RESOURCE_NOT_FOUND", 404, "Lote não encontrado.");
    const existingSettlement = await tx.auctionSettlement.findUnique({ where: { lotId } });
    if (existingSettlement) return existingSettlement;
    const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
    if (nowRows[0]!.now < lot.effectiveEndsAt) return null;
    if (!lot.currentLeaderId || lot.currentBidCents == null) {
      const settlement = await tx.auctionSettlement.create({
        data: {
          id: randomUUID(),
          lotId,
          result: "UNSOLD",
          settledAt: nowRows[0]!.now
        }
      });
      await tx.lot.update({
        where: { id: lotId },
        data: { status: "ENDED", version: { increment: 1 } }
      });
      return settlement;
    }

    const winnerWallet = await tx.wallet.findUnique({ where: { userId: lot.currentLeaderId } });
    const sellerWallet = await tx.wallet.findUnique({ where: { userId: lot.sellerId } });
    if (!winnerWallet || !sellerWallet) {
      throw new AppError("SETTLEMENT_FAILED", 500, "Carteiras da liquidação não foram encontradas.");
    }
    for (const walletId of [winnerWallet.id, sellerWallet.id].sort()) {
      await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${walletId}::uuid FOR UPDATE`;
    }
    const hold = await tx.walletHold.findUnique({
      where: { walletId_lotId: { walletId: winnerWallet.id, lotId } }
    });
    if (!hold || hold.status !== "ACTIVE" || hold.amountCents !== lot.currentBidCents) {
      throw new AppError("SETTLEMENT_FAILED", 409, "A reserva do vencedor está inconsistente.");
    }
    const winningBid = await tx.bid.findFirstOrThrow({
      where: { lotId },
      orderBy: { sequence: "desc" }
    });
    const settlementId = randomUUID();
    const settlement = await tx.auctionSettlement.create({
      data: {
        id: settlementId,
        lotId,
        winnerId: lot.currentLeaderId,
        winningBidId: winningBid.id,
        finalAmountCents: lot.currentBidCents,
        result: "SOLD",
        settledAt: nowRows[0]!.now
      }
    });
    const winner = await tx.wallet.update({
      where: { id: winnerWallet.id },
      data: {
        totalCents: { decrement: lot.currentBidCents },
        reservedCents: { decrement: lot.currentBidCents }
      }
    });
    const seller = await tx.wallet.update({
      where: { id: sellerWallet.id },
      data: { totalCents: { increment: lot.currentBidCents } }
    });
    await tx.walletHold.update({
      where: { id: hold.id },
      data: { amountCents: 0n, status: "CAPTURED", currentBidId: null }
    });
    await tx.walletTransaction.createMany({
      data: [
        {
          id: randomUUID(),
          walletId: winnerWallet.id,
          lotId,
          settlementId,
          type: "AUCTION_DEBIT",
          amountCents: lot.currentBidCents,
          balanceAfterCents: winner.totalCents
        },
        {
          id: randomUUID(),
          walletId: sellerWallet.id,
          lotId,
          settlementId,
          type: "AUCTION_CREDIT",
          amountCents: lot.currentBidCents,
          balanceAfterCents: seller.totalCents
        }
      ]
    });
    await tx.receipt.create({
      data: { id: randomUUID(), lotId, settlementId, publicToken: randomToken() }
    });
    await tx.lot.update({
      where: { id: lotId },
      data: { status: "ENDED", version: { increment: 1 } }
    });
    hitProcessTestFault("settlement.before_commit");
    return settlement;
  }, options);
}
