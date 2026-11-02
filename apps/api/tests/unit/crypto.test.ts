import { describe, expect, it } from "vitest";
import { hashPassword, randomToken, sha256, verifyPassword } from "../../src/shared/crypto.ts";

describe("shared cryptography", () => {
  it("produces the expected SHA-256 vector", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("creates independent URL-safe random tokens", () => {
    const first = randomToken();
    const second = randomToken();
    expect(first).toHaveLength(43);
    expect(second).not.toBe(first);
  });

  it("accepts the correct password and rejects another one", async () => {
    const hash = await hashPassword("SenhaSegura123");
    expect(await verifyPassword("SenhaSegura123", hash)).toBe(true);
    expect(await verifyPassword("outra", hash)).toBe(false);
  });
});
