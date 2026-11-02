import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.ts";
import { env } from "../../src/config/env.ts";
import { saveCover } from "../../src/modules/lots/lots.service.ts";

afterEach(() => vi.unstubAllGlobals());

describe("local cover storage", () => {
  it("ignores missing, invalid, and oversized covers", async () => {
    expect(await saveCover(null, randomUUID())).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("not-an-image", { status: 200, headers: { "content-type": "text/plain" } })
    ));
    expect(await saveCover(1, randomUUID())).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("x", {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "3000001" }
      })
    ));
    expect(await saveCover(2, randomUUID())).toBeNull();
  });

  it("persists a valid cover and serves only its public filename", async () => {
    const lotId = randomUUID();
    const bytes = Buffer.from("89504e470d0a1a0a", "hex");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(bytes.length) }
      })
    ));
    const filename = await saveCover(123, lotId);
    expect(filename).toBe(`${lotId}.png`);
    try {
      const response = await request(app).get(`/api/covers/${filename}`);
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/^image\/png/);
      expect(response.body).toEqual(bytes);
    } finally {
      await unlink(resolve(env.coverDir, filename!)).catch(() => undefined);
    }
  });

  it("returns 404 for traversal and non-allowlisted filenames", async () => {
    expect((await request(app).get("/api/covers/..%2F.env")).status).toBe(404);
    expect((await request(app).get("/api/covers/not-a-uuid.png")).status).toBe(404);
  });
});
