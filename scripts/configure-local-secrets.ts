import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const envPath = resolve(projectRoot, ".env");
const original = await readFile(envPath, "utf8");
const lines = original.split(/\r?\n/);

function valueOf(key: string) {
  const line = lines.find((item) => item.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim() ?? "";
}

function setValue(key: string, value: string) {
  const index = lines.findIndex((item) => item.startsWith(`${key}=`));
  const line = `${key}=${value}`;
  if (index >= 0) lines[index] = line;
  else lines.push(line);
}

const currentSession = valueOf("SESSION_SECRET");
const generateSession = currentSession.length < 32 || currentSession.startsWith("generate-");
if (generateSession) setValue("SESSION_SECRET", randomBytes(48).toString("base64url"));

let privateValue = valueOf("AUDIT_PRIVATE_KEY");
let publicValue = valueOf("AUDIT_PUBLIC_KEY");
const generateAuditPair = !privateValue || !publicValue;
if (generateAuditPair) {
  const pair = generateKeyPairSync("ed25519");
  privateValue = pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  publicValue = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  setValue("AUDIT_PRIVATE_KEY", privateValue);
  setValue("AUDIT_PUBLIC_KEY", publicValue);
}

const privateKey = createPrivateKey({
  key: Buffer.from(privateValue, "base64"),
  format: "der",
  type: "pkcs8"
});
const publicKey = createPublicKey({
  key: Buffer.from(publicValue, "base64"),
  format: "der",
  type: "spki"
});
const challenge = randomBytes(32);
if (!verify(null, challenge, publicKey, sign(null, challenge, privateKey))) {
  throw new Error("O par Ed25519 configurado nao e coerente.");
}

await writeFile(envPath, `${lines.filter((line, index) => line || index < lines.length - 1).join("\n")}\n`, {
  encoding: "utf8",
  flag: "w"
});

console.log(`Local secrets configured: session=${generateSession ? "generated" : "preserved"}, audit=${generateAuditPair ? "generated" : "verified"}.`);
