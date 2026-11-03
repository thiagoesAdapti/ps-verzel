import type { RequestHandler } from "express";
import { env } from "../config/env.ts";
import { AppError } from "../shared/errors.ts";

export const requireOrigin: RequestHandler = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.headers.origin !== env.APP_ORIGIN) {
    return next(new AppError("FORBIDDEN", 403, "Origem da requisição não permitida."));
  }
  next();
};
