import { Router } from "express";
import { z } from "zod";
import { verifyLotAudit } from "./audit.service.ts";

export const auditRouter = Router({ mergeParams: true });

auditRouter.get("/", async (req, res) => {
  const lotId = z.uuid().parse((req.params as { id: string }).id);
  res.json({ data: await verifyLotAudit(lotId) });
});
