import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.ts";
import { env } from "../../src/config/env.ts";
import { cleanupTestArtifacts, resetTestDatabase } from "../helpers/integration.ts";

const credentials = {
  name: "Licitante de Integracao",
  email: "bidder-auth@integration.local",
  password: "SenhaSegura123",
  role: "BIDDER" as const
};

beforeAll(() => resetTestDatabase());
afterAll(() => cleanupTestArtifacts());

describe("authentication session lifecycle", () => {
  it("registers a user and rejects duplicate email", async () => {
    const created = await request(app)
      .post("/api/auth/register")
      .set("Origin", env.APP_ORIGIN)
      .send(credentials);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ email: credentials.email, role: "BIDDER" });

    const duplicate = await request(app)
      .post("/api/auth/register")
      .set("Origin", env.APP_ORIGIN)
      .send(credentials);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatchObject({ code: "EMAIL_ALREADY_EXISTS" });
  });

  it("rejects invalid credentials", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", env.APP_ORIGIN)
      .send({ email: credentials.email, password: "senha-incorreta" });
    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("creates, restores, and revokes an HttpOnly session", async () => {
    const agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .set("Origin", env.APP_ORIGIN)
      .send({ email: credentials.email, password: credentials.password });
    expect(login.status).toBe(200);
    expect(login.headers["set-cookie"]?.[0]).toMatch(/auction_sid=.*HttpOnly.*SameSite=Lax/i);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ email: credentials.email, role: "BIDDER" });

    const logout = await agent.post("/api/auth/logout").set("Origin", env.APP_ORIGIN);
    expect(logout.status).toBe(200);
    expect(logout.headers["set-cookie"]?.[0]).toMatch(/auction_sid=;/);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });
});
