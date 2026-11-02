import cookieParser from "cookie-parser";
import express from "express";
import { errorMiddleware, notFound, requestContext } from "./middlewares/error.middleware.ts";

export const app = express();

app.disable("x-powered-by");
app.use(requestContext, express.json({ limit: "100kb" }), cookieParser());
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use(notFound, errorMiddleware);
