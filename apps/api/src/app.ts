import cookieParser from "cookie-parser";
import express from "express";
import { optionalAuth } from "./middlewares/auth.middleware.ts";
import { errorMiddleware, notFound, requestContext } from "./middlewares/error.middleware.ts";
import { authRouter } from "./modules/auth/auth.routes.ts";

export const app = express();

app.disable("x-powered-by");
app.use(requestContext, express.json({ limit: "100kb" }), cookieParser(), optionalAuth);
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRouter);
app.use(notFound, errorMiddleware);
