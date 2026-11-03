import { prisma } from "../config/database.ts";
import { settleLot } from "../modules/auctions/settlement.service.ts";
import { emitLot } from "../realtime/socket.server.ts";
import { log } from "../shared/logger.ts";

let timer: NodeJS.Timeout | undefined;
let running = false;

export async function runAuctionCycle() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const starting = await prisma.lot.findMany({
      where: { status: "SCHEDULED", startsAt: { lte: now }, auditState: "READY" },
      select: { id: true }
    });
    for (const lot of starting) {
      const updated = await prisma.lot.updateMany({
        where: { id: lot.id, status: "SCHEDULED", auditState: "READY" },
        data: { status: "LIVE", version: { increment: 1 } }
      });
      if (updated.count === 1) {
        emitLot("lot:started", lot.id, { startedAt: now.toISOString() });
      }
    }
    const ended = await prisma.lot.findMany({
      where: {
        status: { in: ["SCHEDULED", "LIVE"] },
        effectiveEndsAt: { lte: now }
      },
      select: { id: true }
    });
    for (const lot of ended) {
      const settlement = await settleLot(lot.id);
      if (settlement) {
        emitLot("lot:ended", lot.id, {
          result: settlement.result,
          settledAt: settlement.settledAt.toISOString()
        });
      }
    }
  } catch (error) {
    log("error", "scheduler.failed", {
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    running = false;
  }
}

export function startScheduler() {
  timer = setInterval(() => void runAuctionCycle(), 2_000);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
