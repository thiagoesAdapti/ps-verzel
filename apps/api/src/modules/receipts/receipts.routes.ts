import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/database.ts";
import { requireRole } from "../../middlewares/auth.middleware.ts";
import { AppError } from "../../shared/errors.ts";

const paging = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12)
});

export const personalRouter = Router();
personalRouter.use(requireRole("BIDDER"));

personalRouter.get("/participations", async (req, res) => {
  const query = paging.parse(req.query);
  const where = { userId: req.auth!.userId };
  const [rows, total, leading, won] = await Promise.all([
    prisma.lotParticipant.findMany({
      where,
      include: {
        lot: {
          include: {
            bids: {
              where: { bidderId: req.auth!.userId },
              orderBy: { amountCents: "desc" },
              take: 1
            },
            settlement: true,
            receipt: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit
    }),
    prisma.lotParticipant.count({ where }),
    prisma.lotParticipant.count({
      where: {
        userId: req.auth!.userId,
        lot: { currentLeaderId: req.auth!.userId, status: "LIVE" }
      }
    }),
    prisma.auctionSettlement.count({
      where: { winnerId: req.auth!.userId, result: "SOLD" }
    })
  ]);
  res.json({
    data: rows.map(({ lot }) => ({
      lotId: lot.id,
      title: lot.title,
      coverUrl: lot.coverLocalPath ? `/api/covers/${lot.coverLocalPath}` : null,
      status: lot.status,
      highestBidCents: lot.bids[0]?.amountCents.toString() ?? null,
      isLeading: lot.currentLeaderId === req.auth!.userId,
      won: lot.settlement?.winnerId === req.auth!.userId,
      finalAmountCents: lot.settlement?.finalAmountCents?.toString() ?? null,
      receiptToken: lot.receipt?.publicToken ?? null
    })),
    summary: { total, leading, won },
    meta: { ...query, total, totalPages: Math.ceil(total / query.limit) }
  });
});

personalRouter.get("/wins", async (req, res) => {
  const settlements = await prisma.auctionSettlement.findMany({
    where: { winnerId: req.auth!.userId, result: "SOLD" },
    include: { lot: { include: { receipt: true } } },
    orderBy: { settledAt: "desc" }
  });
  res.json({
    data: settlements.map((row) => ({
      lotId: row.lotId,
      title: row.lot.title,
      finalAmountCents: row.finalAmountCents!.toString(),
      settledAt: row.settledAt.toISOString(),
      receiptToken: row.lot.receipt?.publicToken ?? null
    }))
  });
});

export const receiptsRouter = Router();

receiptsRouter.get("/:token", async (req, res) => {
  const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(req.params.token);
  const receipt = await prisma.receipt.findUnique({
    where: { publicToken: token },
    include: { lot: { include: { participants: true } }, settlement: true }
  });
  if (!receipt || !receipt.settlement.winnerId) {
    throw new AppError("RESOURCE_NOT_FOUND", 404, "Comprovante nao encontrado.");
  }
  const winner = receipt.lot.participants.find(
    (participant) => participant.userId === receipt.settlement.winnerId
  );
  res.json({
    data: {
      token: receipt.publicToken,
      lotId: receipt.lotId,
      title: receipt.lot.title,
      authors: receipt.lot.authors,
      coverUrl: receipt.lot.coverLocalPath ? `/api/covers/${receipt.lot.coverLocalPath}` : null,
      finalAmountCents: receipt.settlement.finalAmountCents!.toString(),
      winner: `Licitante ${String(winner?.publicNumber ?? 0).padStart(2, "0")}`,
      settledAt: receipt.settlement.settledAt.toISOString(),
      result: "SOLD"
    }
  });
});
