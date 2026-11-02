import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.ts";
import { requireRole } from "../../src/middlewares/auth.middleware.ts";
import { errorMiddleware, requestContext } from "../../src/middlewares/error.middleware.ts";

function roleApp(role?: "AUCTIONEER" | "BIDDER") {
  const target = express();
  target.use(requestContext);
  if (role) {
    target.use((req, _res, next) => {
      req.auth = {
        userId: "11111111-1111-4111-8111-111111111111",
        sessionId: "22222222-2222-4222-8222-222222222222",
        role,
        name: "Teste",
        email: "teste@example.com"
      };
      next();
    });
  }
  target.post("/auctioneer", requireRole("AUCTIONEER"), (_req, res) => res.json({ ok: true }));
  target.use(errorMiddleware);
  return target;
}

describe("authorization and origin protection", () => {
  it("requires authentication before role checks", async () => {
    expect((await request(roleApp()).post("/auctioneer")).status).toBe(401);
  });

  it("rejects a cross-role request", async () => {
    expect((await request(roleApp("BIDDER")).post("/auctioneer")).status).toBe(403);
  });

  it("accepts the required role", async () => {
    expect((await request(roleApp("AUCTIONEER")).post("/auctioneer")).status).toBe(200);
  });

  it("blocks an invalid mutation origin before the route handler", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .set("Origin", "https://example.invalid")
      .send({ name: "Teste", email: "teste@example.com", password: "SenhaSegura123", role: "BIDDER" });
    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps safe public reads available", async () => {
    const response = await request(app).get("/api/health").set("Origin", "https://example.invalid");
    expect(response.status).toBe(200);
  });
});
