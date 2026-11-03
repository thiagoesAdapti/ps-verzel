import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client.ts";
import { prisma, transaction } from "../../config/database.ts";
import { requireRole } from "../../middlewares/auth.middleware.ts";
import { AppError } from "../../shared/errors.ts";
import { cents, jsonMoney } from "../../shared/money.ts";
import { readCatalogToken } from "../catalog/catalog.service.ts";
import { createLot, serializeLot } from "./lots.service.ts";

export const lotsRouter = Router();

const paging = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12)
});

const createLotBody = z.object({
  catalogToken: z.string().min(1),
  description: z.string().trim().min(10).max(2000),
  condition: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"]),
  startingBidCents: z.string(),
  minimumIncrementCents: z.string(),
  startsImmediately: z.boolean().optional().default(false),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime()
}).superRefine((body, context) => {
  if (!body.startsImmediately && !body.startsAt) {
    context.addIssue({
      code: "custom",
      path: ["startsAt"],
      message: "Informe o início ou selecione o início imediato."
    });
  }
  if (body.startsImmediately && body.startsAt) {
    context.addIssue({
      code: "custom",
      path: ["startsAt"],
      message: "Não informe uma data de início junto com o início imediato."
    });
  }
});

lotsRouter.post("/", requireRole("AUCTIONEER"), async (req, res) => {
  const body = createLotBody.parse(req.body);
  const serverNow = new Date();
  const startsAt = body.startsImmediately ? serverNow : new Date(body.startsAt!);
  const endsAt = new Date(body.endsAt);
  if (!body.startsImmediately && startsAt <= serverNow) {
    throw new AppError("VALIDATION_ERROR", 422, "O início agendado deve estar no futuro.");
  }
  if (endsAt <= startsAt || endsAt <= serverNow) {
    throw new AppError("VALIDATION_ERROR", 422, "O encerramento deve ser posterior ao início e estar no futuro.");
  }
  const lot = await createLot({
    sellerId: req.auth!.userId,
    book: readCatalogToken(body.catalogToken, req.auth!.userId),
    description: body.description,
    condition: body.condition,
    startingBidCents: cents(body.startingBidCents),
    minimumIncrementCents: cents(body.minimumIncrementCents),
    startsAt,
    endsAt
  });
  res.status(201).json({ data: serializeLot(lot) });
});

async function orderedAuctioneerLotIds(sellerId: string, page: number, limit: number) {
  return prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM lots
    WHERE seller_id = ${sellerId}::uuid
    ORDER BY
      CASE status
        WHEN 'LIVE'::"LotStatus" THEN 1
        WHEN 'SCHEDULED'::"LotStatus" THEN 2
        WHEN 'ENDED'::"LotStatus" THEN 3
        WHEN 'CANCELLED'::"LotStatus" THEN 4
      END ASC,
      CASE WHEN status = 'LIVE'::"LotStatus" THEN effective_ends_at END ASC,
      CASE WHEN status = 'SCHEDULED'::"LotStatus" THEN starts_at END ASC,
      CASE WHEN status = 'ENDED'::"LotStatus" THEN effective_ends_at END DESC,
      CASE WHEN status = 'CANCELLED'::"LotStatus" THEN updated_at END DESC,
      id ASC
    OFFSET ${(page - 1) * limit}
    LIMIT ${limit}
  `);
}

function restoreIdOrder<T extends { id: string }>(ids: Array<{ id: string }>, rows: T[]) {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return ids.map(({ id }) => rowsById.get(id)).filter((row): row is T => Boolean(row));
}

lotsRouter.post("/:id/cancel", requireRole("AUCTIONEER"), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const lot = await transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM lots WHERE id = ${id}::uuid FOR UPDATE`;
    const current = await tx.lot.findUnique({ where: { id } });
    if (!current) throw new AppError("RESOURCE_NOT_FOUND", 404, "Lote não encontrado.");
    if (current.sellerId !== req.auth!.userId) {
      throw new AppError("FORBIDDEN", 403, "Você não pode gerenciar este lote.");
    }
    const [acceptedBids, nowRows] = await Promise.all([
      tx.bid.count({ where: { lotId: id } }),
      tx.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`
    ]);
    const cancellableStatus = current.status === "SCHEDULED" || current.status === "LIVE";
    if (
      !cancellableStatus
      || current.effectiveEndsAt <= nowRows[0]!.now
      || current.bidCount > 0
      || acceptedBids > 0
    ) {
      throw new AppError("LOT_CANNOT_BE_CANCELLED", 409, "Este lote não pode ser cancelado.");
    }
    return tx.lot.update({
      where: { id },
      data: { status: "CANCELLED", version: { increment: 1 } }
    });
  });
  res.json({ data: serializeLot(lot) });
});

export const auctioneerRouter = Router();

auctioneerRouter.get("/lots", requireRole("AUCTIONEER"), async (req, res) => {
  const { page, limit } = paging.parse(req.query);
  const where = { sellerId: req.auth!.userId };
  const now = new Date();
  const [orderedIds, total, live, received] = await Promise.all([
    orderedAuctioneerLotIds(req.auth!.userId, page, limit),
    prisma.lot.count({ where }),
    prisma.lot.count({
      where: { ...where, status: "LIVE", startsAt: { lte: now }, effectiveEndsAt: { gt: now } }
    }),
    prisma.walletTransaction.aggregate({
      where: {
        type: "AUCTION_CREDIT",
        wallet: { userId: req.auth!.userId },
        lot: { sellerId: req.auth!.userId },
        settlementId: { not: null }
      },
      _sum: { amountCents: true }
    })
  ]);
  const unorderedRows = orderedIds.length
    ? await prisma.lot.findMany({
        where: { id: { in: orderedIds.map(({ id }) => id) }, sellerId: req.auth!.userId },
        include: { settlement: true }
      })
    : [];
  const rows = restoreIdOrder(orderedIds, unorderedRows);
  res.json({
    data: rows.map((lot: any) => ({
      ...serializeLot(lot),
      result: lot.settlement?.result ?? null,
      finalAmountCents: jsonMoney(lot.settlement?.finalAmountCents)
    })),
    summary: { total, live, receivedCents: jsonMoney(received._sum.amountCents ?? 0n) },
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
  });
});
