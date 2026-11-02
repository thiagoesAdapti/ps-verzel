import cookieParser from "cookie-parser";
import express from "express";
import { optionalAuth } from "./middlewares/auth.middleware.ts";
import { errorMiddleware, notFound, requestContext } from "./middlewares/error.middleware.ts";
import { requireOrigin } from "./middlewares/origin.middleware.ts";
import { authRouter } from "./modules/auth/auth.routes.ts";
import { catalogRouter } from "./modules/catalog/catalog.routes.ts";

export const app = express();

app.disable("x-powered-by");
app.use(requestContext, express.json({ limit: "100kb" }), cookieParser(), optionalAuth, requireOrigin);
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRouter);
app.use("/api/catalog", catalogRouter);
app.use(notFound, errorMiddleware);
