import { generateKeyPairSync } from "node:crypto";

const pair = generateKeyPairSync("ed25519");
const keys = {
  privateKey: pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  publicKey: pair.publicKey.export({ format: "der", type: "spki" }).toString("base64")
};

console.log("Copy these lines to the root .env and keep the private key secret:\n");
console.log(`AUDIT_PRIVATE_KEY=${keys.privateKey}`);
console.log(`AUDIT_PUBLIC_KEY=${keys.publicKey}`);
