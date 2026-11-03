import { generateKeyPairSync, randomBytes } from "node:crypto";
import { open } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const requestedPath = process.argv[2];
if (!requestedPath || !isAbsolute(requestedPath)) {
  throw new Error(
    "Informe um caminho absoluto novo para o arquivo de segredos de producao."
  );
}

const outputPath = resolve(requestedPath);
const pair = generateKeyPairSync("ed25519");
const sessionSecret = randomBytes(48).toString("base64url");
const privateKey = pair.privateKey
  .export({ format: "der", type: "pkcs8" })
  .toString("base64");
const publicKey = pair.publicKey
  .export({ format: "der", type: "spki" })
  .toString("base64");

const file = await open(outputPath, "wx", 0o600);
try {
  await file.writeFile(
    [
      `SESSION_SECRET=${sessionSecret}`,
      `AUDIT_PRIVATE_KEY=${privateKey}`,
      `AUDIT_PUBLIC_KEY=${publicKey}`,
      ""
    ].join("\n"),
    { encoding: "utf8" }
  );
  await file.chmod(0o600);
} finally {
  await file.close();
}

console.log(`Arquivo de segredos criado com permissoes restritas: ${outputPath}`);
