import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/errors.ts";
import { log } from "../shared/logger.ts";

export const requestContext: RequestHandler = (req, _res, next) => {
  req.requestId = randomUUID();
  next();
};

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError("RESOURCE_NOT_FOUND", 404, "Recurso não encontrado."));
};

export const errorMiddleware: ErrorRequestHandler = (error, req, res, _next) => {
  const normalized = error instanceof AppError
    ? error
    : error instanceof ZodError
      ? new AppError("VALIDATION_ERROR", 422, "Confira os dados informados.", error.issues)
      : new AppError("INTERNAL_ERROR", 500, "Não foi possível concluir a operação.");

  if (normalized.status >= 500) {
    log("error", "request.failed", {
      requestId: req.requestId,
      code: normalized.code,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  res.status(normalized.status).json({
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details ?? []
    },
    requestId: req.requestId
  });
};
