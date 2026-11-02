import { describe, expect, it } from "vitest";
import { createPrivateKey, createPublicKey } from "node:crypto";
import {
  bidHash,
  canonical,
  generateAuditKeys,
  genesisHash,
  signCanonical,
  verifyCanonical
} from "../../src/modules/audit/audit-crypto.ts";
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

  it("signs and verifies canonical content with Ed25519", () => {
    const value = canonical(["audit-v1", 1]);
    expect(verifyCanonical(value, signCanonical(value))).toBe(true);
  });

  it("rejects tampered signed content", () => {
    const signature = signCanonical("original");
    expect(verifyCanonical("tampered", signature)).toBe(false);
  });

  it("creates stable genesis and chained bid hashes", () => {
    const genesisInput = {
      lotId: "11111111-1111-4111-8111-111111111111",
      sellerId: "22222222-2222-4222-8222-222222222222",
      startingBidCents: 100n,
      minimumIncrementCents: 10n,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      originalEndsAt: new Date("2026-01-01T01:00:00.000Z")
    };
    const genesis = genesisHash(genesisInput);
    expect(genesis).toHaveLength(64);
    expect(genesisHash(genesisInput)).toBe(genesis);
    expect(bidHash({
      lotId: genesisInput.lotId,
      sequence: 1,
      publicNumber: 1,
      amountCents: 100n,
      acceptedAt: new Date("2026-01-01T00:10:00.000Z"),
      previousHash: genesis
    })).toHaveLength(64);
  });

  it("generates parseable PKCS8 and SPKI key material", () => {
    const keys = generateAuditKeys();
    expect(() => createPrivateKey({ key: Buffer.from(keys.privateKey, "base64"), format: "der", type: "pkcs8" })).not.toThrow();
    expect(() => createPublicKey({ key: Buffer.from(keys.publicKey, "base64"), format: "der", type: "spki" })).not.toThrow();
  });
});
