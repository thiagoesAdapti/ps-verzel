import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/database.ts";
import { requireRole } from "../../middlewares/auth.middleware.ts";
import { AppError } from "../../shared/errors.ts";
import { cents } from "../../shared/money.ts";
import { placeBid } from "./bids.service.ts";

export const bidsRouter = Router({ mergeParams: true });

bidsRouter.post("/", requireRole("BIDDER"), async (req, res) => {
  const lotId = z.uuid().parse((req.params as { id: string }).id);
  const key = z.uuid().parse(req.header("Idempotency-Key"));
  const amount = cents(z.object({ amountCents: z.string() }).parse(req.body).amountCents);
  const data = await placeBid({ lotId, bidderId: req.auth!.userId, amountCents: amount, key });
  res.status(201).json({ data });
});

bidsRouter.get("/", async (req, res) => {
  const lotId = z.uuid().parse((req.params as { id: string }).id);
  const query = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20)
  }).parse(req.query);
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new AppError("RESOURCE_NOT_FOUND", 404, "Lote não encontrado.");
  if (lot.auditState !== "READY") {
    throw new AppError("AUDIT_PENDING", 423, "O histórico está sendo sincronizado.");
  }
  const [rows, total] = await Promise.all([
    prisma.bid.findMany({
      where: { lotId },
      include: { participant: true },
      orderBy: { sequence: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit
    }),
    prisma.bid.count({ where: { lotId } })
  ]);
  res.json({
    data: rows.map((row) => ({
      sequence: row.sequence,
      participant: `Licitante ${String(row.participant.publicNumber).padStart(2, "0")}`,
      amountCents: row.amountCents.toString(),
      acceptedAt: row.acceptedAt.toISOString(),
      hash: row.hash
    })),
    meta: { ...query, total, totalPages: Math.ceil(total / query.limit) }
  });
});
