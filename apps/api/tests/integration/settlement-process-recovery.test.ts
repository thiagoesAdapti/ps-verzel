import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database.ts";
import { placeBid } from "../../src/modules/bids/bids.service.ts";
import {
  cleanupTestArtifacts,
  createTestBidder,
  createTestLot,
  createTestUser,
  resetTestDatabase
} from "../helpers/integration.ts";
import {
  availablePort,
  startApiProcess,
  stopProcess,
  waitForHttp,
  type ManagedProcess
} from "../helpers/processes.ts";

beforeEach(resetTestDatabase);
afterAll(cleanupTestArtifacts);

describe("recuperacao da liquidacao apos queda real", () => {
  it("CT-031 reverte a transacao interrompida e recupera uma unica vez nos reinicios", async () => {
    const seller = await createTestUser("ct031-seller", "AUCTIONEER");
    const bidder = await createTestBidder("ct031-winner", 100_000n);
    const lot = await createTestLot({ sellerId: seller.id, label: "ct031" });
    await placeBid({
      lotId: lot.id,
      bidderId: bidder.id,
      amountCents: 10_000n,
      key: randomUUID()
    });
    const endedAt = new Date(Date.now() - 1_000);
    await prisma.lot.update({
      where: { id: lot.id },
      data: { originalEndsAt: endedAt, effectiveEndsAt: endedAt }
    });

    const faultPort = await availablePort();
    const faulted = startApiProcess(faultPort, "http://127.0.0.1:5373", {
      TEST_PROCESS_FAULT: "settlement.before_commit",
      TEST_PROCESS_FAULT_EXIT_CODE: "86"
    });
    const crash = await Promise.race([
      faulted.exited,
      new Promise<never>((_resolve, reject) => setTimeout(
        () => reject(new Error(`Servidor nao interrompeu durante a liquidacao.\n${faulted.output()}`)),
        20_000
      ))
    ]);
    expect(crash).toMatchObject({ code: 86 });

    expect(await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } }))
      .toMatchObject({ status: "LIVE", currentLeaderId: bidder.id, currentBidCents: 10_000n });
    expect(await prisma.auctionSettlement.count({ where: { lotId: lot.id } })).toBe(0);
    expect(await prisma.walletTransaction.count({ where: { lotId: lot.id } })).toBe(0);
    expect(await prisma.receipt.count({ where: { lotId: lot.id } })).toBe(0);
    const winnerBeforeRecovery = await prisma.wallet.findUniqueOrThrow({
      where: { userId: bidder.id }
    });
    expect(winnerBeforeRecovery).toMatchObject({ totalCents: 100_000n, reservedCents: 10_000n });
    expect(await prisma.walletHold.findUniqueOrThrow({
      where: { walletId_lotId: { walletId: winnerBeforeRecovery.id, lotId: lot.id } }
    })).toMatchObject({ status: "ACTIVE", amountCents: 10_000n });

    let recovered: ManagedProcess | undefined;
    let secondRestart: ManagedProcess | undefined;
    try {
      const recoveryPort = await availablePort();
      recovered = startApiProcess(recoveryPort, "http://127.0.0.1:5373");
      await waitForHttp(`http://127.0.0.1:${recoveryPort}/api/health`, recovered);

      const settled = await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } });
      const winner = await prisma.wallet.findUniqueOrThrow({ where: { userId: bidder.id } });
      const sellerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: seller.id } });
      expect(settled.status).toBe("ENDED");
      expect(await prisma.auctionSettlement.count({ where: { lotId: lot.id } })).toBe(1);
      expect(await prisma.walletTransaction.count({
        where: { lotId: lot.id, type: "AUCTION_DEBIT" }
      })).toBe(1);
      expect(await prisma.walletTransaction.count({
        where: { lotId: lot.id, type: "AUCTION_CREDIT" }
      })).toBe(1);
      expect(await prisma.receipt.count({ where: { lotId: lot.id } })).toBe(1);
      expect(winner).toMatchObject({ totalCents: 90_000n, reservedCents: 0n });
      expect(sellerWallet.totalCents).toBe(10_000n);
      expect(await prisma.walletHold.findUniqueOrThrow({
        where: { walletId_lotId: { walletId: winner.id, lotId: lot.id } }
      })).toMatchObject({ status: "CAPTURED", amountCents: 0n });

      await stopProcess(recovered);
      recovered = undefined;
      const secondPort = await availablePort();
      secondRestart = startApiProcess(secondPort, "http://127.0.0.1:5373");
      await waitForHttp(`http://127.0.0.1:${secondPort}/api/health`, secondRestart);
      expect(await prisma.auctionSettlement.count({ where: { lotId: lot.id } })).toBe(1);
      expect(await prisma.walletTransaction.count({ where: { lotId: lot.id } })).toBe(2);
      expect(await prisma.receipt.count({ where: { lotId: lot.id } })).toBe(1);
    } finally {
      await stopProcess(recovered);
      await stopProcess(secondRestart);
    }
  }, 60_000);
});
