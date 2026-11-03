import { randomUUID } from "node:crypto";
import { Router, type CookieOptions } from "express";
import { z } from "zod";
import { prisma, transaction } from "../../config/database.ts";
import { env } from "../../config/env.ts";
import { hashPassword, randomToken, sha256, verifyPassword } from "../../shared/crypto.ts";
import { AppError } from "../../shared/errors.ts";
import { requireAuth } from "../../middlewares/auth.middleware.ts";

export const authRouter = Router();

export function sessionCookieOptions(nodeEnv: typeof env.NODE_ENV): CookieOptions & { maxAge: number } {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: nodeEnv === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

const cookie = sessionCookieOptions(env.NODE_ENV);
const { maxAge: _maxAge, ...clearCookie } = cookie;
const userBody = z.object({ name: z.string().trim().min(2).max(120), email: z.email().max(320).transform((v) => v.toLowerCase()), password: z.string().min(8).max(200), role: z.enum(["AUCTIONEER", "BIDDER"]) });

authRouter.post("/register", async (req, res) => {
  const input = userBody.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError("EMAIL_ALREADY_EXISTS", 409, "Este e-mail já está cadastrado.");
  const user = await transaction(async (tx) => {
    const created = await tx.user.create({ data: { id: randomUUID(), name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: input.role } });
    await tx.wallet.create({ data: { id: randomUUID(), userId: created.id } });
    return created;
  });
  res.status(201).json({ data: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

authRouter.post("/login", async (req, res) => {
  const input = z.object({ email: z.email().transform((v) => v.toLowerCase()), password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw new AppError("INVALID_CREDENTIALS", 401, "E-mail ou senha inválidos.");
  const raw = randomToken();
  await prisma.session.create({ data: { id: randomUUID(), userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + cookie.maxAge) } });
  res.cookie("auction_sid", raw, cookie).json({ data: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  await prisma.session.update({ where: { id: req.auth!.sessionId }, data: { revokedAt: new Date() } });
  res.clearCookie("auction_sid", clearCookie).json({ data: { success: true } });
});

authRouter.get("/me", requireAuth, (req, res) => res.json({ data: { id: req.auth!.userId, name: req.auth!.name, email: req.auth!.email, role: req.auth!.role } }));
