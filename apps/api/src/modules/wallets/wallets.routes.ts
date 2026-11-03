import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/database.ts";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.ts";
import { cents, jsonMoney } from "../../shared/money.ts";
import { depositFunds } from "./wallets.service.ts";

export const walletsRouter = Router();

walletsRouter.use(requireAuth);

walletsRouter.get("/", async (req, res) => {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: req.auth!.userId } });
  res.json({
    data: {
      currency: "BRL",
      totalCents: wallet.totalCents.toString(),
      reservedCents: wallet.reservedCents.toString(),
      availableCents: (wallet.totalCents - wallet.reservedCents).toString()
    }
  });
});

walletsRouter.post("/deposits", requireRole("BIDDER"), async (req, res) => {
  const key = z.uuid().parse(req.header("Idempotency-Key"));
  const amount = cents(
    z.object({ amountCents: z.string() }).parse(req.body).amountCents,
    100n,
    1_000_000n
  );
  const result = await depositFunds({ userId: req.auth!.userId, amountCents: amount, key });
  res.status(201).json({ data: result });
});

walletsRouter.get("/transactions", async (req, res) => {
  const query = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20)
  }).parse(req.query);
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: req.auth!.userId } });
  const [rows, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { lot: { select: { title: true, receipt: { select: { publicToken: true } } } } }
    }),
    prisma.walletTransaction.count({ where: { walletId: wallet.id } })
  ]);
  res.json({
    data: rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      amountCents: jsonMoney(row.amountCents),
      balanceAfterCents: jsonMoney(row.balanceAfterCents),
      lotTitle: row.lot?.title ?? null,
      receiptToken: row.lot?.receipt?.publicToken ?? null,
      createdAt: row.createdAt.toISOString()
    })),
    meta: { ...query, total, totalPages: Math.ceil(total / query.limit) }
  });
});
