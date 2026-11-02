import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { env } from "../../config/env.ts";
import { sha256 } from "../../shared/crypto.ts";

export const canonical = (values: readonly unknown[]) => JSON.stringify(values);

export const genesisHash = (input: {
  lotId: string;
  sellerId: string;
  startingBidCents: bigint;
  minimumIncrementCents: bigint;
  startsAt: Date;
  originalEndsAt: Date;
}) => sha256(canonical([
  "genesis-v1",
  input.lotId.toLowerCase(),
  input.sellerId.toLowerCase(),
  input.startingBidCents.toString(),
  input.minimumIncrementCents.toString(),
  input.startsAt.toISOString(),
  input.originalEndsAt.toISOString()
]));

export const bidHash = (input: {
  lotId: string;
  sequence: number;
  publicNumber: number;
  amountCents: bigint;
  acceptedAt: Date;
  previousHash: string;
}) => sha256(canonical([
  "bid-v1",
  input.lotId.toLowerCase(),
  input.sequence,
  input.publicNumber,
  input.amountCents.toString(),
  input.acceptedAt.toISOString(),
  input.previousHash.toLowerCase()
]));

const privateKey = createPrivateKey({
  key: Buffer.from(env.AUDIT_PRIVATE_KEY, "base64"),
  format: "der",
  type: "pkcs8"
});
const publicKey = createPublicKey({
  key: Buffer.from(env.AUDIT_PUBLIC_KEY, "base64"),
  format: "der",
  type: "spki"
});

export const signCanonical = (value: string) => sign(null, Buffer.from(value), privateKey).toString("base64");
export const verifyCanonical = (value: string, signature: string) => verify(null, Buffer.from(value), publicKey, Buffer.from(signature, "base64"));
export const publicKeyBase64 = env.AUDIT_PUBLIC_KEY;

export function generateAuditKeys() {
  const pair = generateKeyPairSync("ed25519");
  return {
    privateKey: pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
    publicKey: pair.publicKey.export({ format: "der", type: "spki" }).toString("base64")
  };
}
