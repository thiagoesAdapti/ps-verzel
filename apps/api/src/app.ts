import { resolve, sep } from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import { z } from "zod";
import { env } from "./config/env.ts";
import { optionalAuth } from "./middlewares/auth.middleware.ts";
import { errorMiddleware, notFound, requestContext } from "./middlewares/error.middleware.ts";
import { requireOrigin } from "./middlewares/origin.middleware.ts";
import { authRouter } from "./modules/auth/auth.routes.ts";
import { bidsRouter } from "./modules/bids/bids.routes.ts";
import { catalogRouter } from "./modules/catalog/catalog.routes.ts";
import { auctioneerRouter, lotsRouter } from "./modules/lots/lots.routes.ts";
import { walletsRouter } from "./modules/wallets/wallets.routes.ts";

export const app = express();

app.disable("x-powered-by");
app.use(requestContext, express.json({ limit: "100kb" }), cookieParser(), optionalAuth, requireOrigin);
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/covers/:filename", (req, res, next) => {
  try {
    const filename = z.string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$/i)
      .parse(req.params.filename);
    const target = resolve(env.coverDir, filename);
    if (!target.startsWith(resolve(env.coverDir) + sep)) return next();
    res.sendFile(target, (error) => {
      if (error && !res.headersSent) next();
    });
  } catch {
    next();
  }
});
app.use("/api/auth", authRouter);
app.use("/api/lots/:id/bids", bidsRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/lots", lotsRouter);
app.use("/api/auctioneer", auctioneerRouter);
app.use("/api/wallet", walletsRouter);
app.use(notFound, errorMiddleware);
