import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../../middlewares/auth.middleware.ts";
import { createCatalogToken, searchCatalog } from "./catalog.service.ts";

export const catalogRouter = Router();
catalogRouter.get("/search", requireRole("AUCTIONEER"), async (req, res) => {
  const { q } = z.object({ q: z.string() }).parse(req.query);
  const books = await searchCatalog(q);
  res.json({ data: books.map((book) => ({ ...book, catalogToken: createCatalogToken(book, req.auth!.userId) })) });
});
