import type { RequestHandler } from "express";
import { prisma } from "../config/database.ts";
import { sha256 } from "../shared/crypto.ts";
import { AppError } from "../shared/errors.ts";

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.auction_sid as string | undefined;
  if (!token) return next();
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true }
  });
  if (session && !session.revokedAt && session.expiresAt > new Date()) {
    req.auth = {
      userId: session.userId,
      role: session.user.role,
      sessionId: session.id,
      name: session.user.name,
      email: session.user.email
    };
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  req.auth
    ? next()
    : next(new AppError("AUTHENTICATION_REQUIRED", 401, "Entre na sua conta para continuar."));
};
