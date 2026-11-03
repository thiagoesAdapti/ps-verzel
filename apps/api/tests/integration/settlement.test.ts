import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database.ts";
import { settleLot } from "../../src/modules/auctions/settlement.service.ts";
import { placeBid } from "../../src/modules/bids/bids.service.ts";
import {
  cleanupTestArtifacts,
  createTestBidder,
  createTestLot,
  createTestUser,
  resetTestDatabase
} from "../helpers/integration.ts";

beforeEach(resetTestDatabase);
afterAll(cleanupTestArtifacts);

async function expire(lotId: string) {
  const endedAt = new Date(Date.now() - 1_000);
  await prisma.lot.update({
    where: { id: lotId },
    data: { originalEndsAt: endedAt, effectiveEndsAt: endedAt }
  });
}

describe("liquidacao atomica e idempotente", () => {
  it("liquida uma venda uma unica vez mesmo com chamadas concorrentes", async () => {
    const seller = await createTestUser("settlement-seller", "AUCTIONEER");
    const bidder = await createTestBidder("settlement-winner", 100_000n);
    const lot = await createTestLot({ sellerId: seller.id, label: "sold" });
    await placeBid({ lotId: lot.id, bidderId: bidder.id, amountCents: 10_000n, key: randomUUID() });
    await expire(lot.id);

    const [first, second] = await Promise.all([settleLot(lot.id), settleLot(lot.id)]);
    expect(first?.id).toBe(second?.id);
    expect(await prisma.auctionSettlement.count({ where: { lotId: lot.id } })).toBe(1);
    expect(await prisma.receipt.count({ where: { lotId: lot.id } })).toBe(1);
    expect(await prisma.walletTransaction.count({ where: { lotId: lot.id } })).toBe(2);

    const winnerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: bidder.id } });
    const sellerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: seller.id } });
    const hold = await prisma.walletHold.findUniqueOrThrow({
      where: { walletId_lotId: { walletId: winnerWallet.id, lotId: lot.id } }
    });
    expect(winnerWallet).toMatchObject({ totalCents: 90_000n, reservedCents: 0n });
    expect(sellerWallet.totalCents).toBe(10_000n);
    expect(hold).toMatchObject({ status: "CAPTURED", amountCents: 0n, currentBidId: null });
    expect(await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } }))
      .toMatchObject({ status: "ENDED", currentLeaderId: bidder.id, currentBidCents: 10_000n });
  });

  it("encerra sem vencedor e sem movimentos financeiros quando nao ha lances", async () => {
    const seller = await createTestUser("unsold-seller", "AUCTIONEER");
    const lot = await createTestLot({ sellerId: seller.id, label: "unsold" });
    await expire(lot.id);

    const settlement = await settleLot(lot.id);
    expect(settlement).toMatchObject({ result: "UNSOLD", winnerId: null, finalAmountCents: null });
    expect((await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } })).status).toBe("ENDED");
    expect(await prisma.walletTransaction.count({ where: { lotId: lot.id } })).toBe(0);
    expect(await prisma.receipt.count({ where: { lotId: lot.id } })).toBe(0);
  });

  it("nao encerra antes do prazo efetivo", async () => {
    const seller = await createTestUser("early-seller", "AUCTIONEER");
    const lot = await createTestLot({ sellerId: seller.id, label: "early", endsInMs: 120_000 });
    expect(await settleLot(lot.id)).toBeNull();
    expect(await prisma.auctionSettlement.count({ where: { lotId: lot.id } })).toBe(0);
    expect((await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } })).status).toBe("LIVE");
  });

  it("reverte toda a liquidacao quando a reserva vencedora esta inconsistente", async () => {
    const seller = await createTestUser("rollback-seller", "AUCTIONEER");
    const bidder = await createTestBidder("rollback-winner", 100_000n);
    const lot = await createTestLot({ sellerId: seller.id, label: "rollback" });
    await placeBid({ lotId: lot.id, bidderId: bidder.id, amountCents: 10_000n, key: randomUUID() });
    await expire(lot.id);
    const winnerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: bidder.id } });
    await prisma.walletHold.update({
      where: { walletId_lotId: { walletId: winnerWallet.id, lotId: lot.id } },
      data: { amountCents: 9_999n }
    });

    await expect(settleLot(lot.id)).rejects.toMatchObject({ code: "SETTLEMENT_FAILED" });
    expect(await prisma.auctionSettlement.count({ where: { lotId: lot.id } })).toBe(0);
    expect(await prisma.walletTransaction.count({ where: { lotId: lot.id } })).toBe(0);
    expect(await prisma.receipt.count({ where: { lotId: lot.id } })).toBe(0);
    expect(await prisma.wallet.findUniqueOrThrow({ where: { userId: bidder.id } }))
      .toMatchObject({ totalCents: 100_000n, reservedCents: 10_000n });
    expect((await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } })).status).toBe("LIVE");
  });
});
