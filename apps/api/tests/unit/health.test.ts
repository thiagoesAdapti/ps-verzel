import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.ts";

describe("HTTP shell", () => {
  it("responds to health checks without external services", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("returns the uniform error contract for unknown resources", async () => {
    const response = await request(app).get("/api/unknown");
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(response.body.requestId).toEqual(expect.any(String));
  });
});
