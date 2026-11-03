import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../../middlewares/auth.middleware.ts";
import { AppError } from "../../shared/errors.ts";
import { cents } from "../../shared/money.ts";
import { readCatalogToken } from "../catalog/catalog.service.ts";
import { createLot, serializeLot } from "./lots.service.ts";

export const lotsRouter = Router();

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
