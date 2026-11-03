import { generateKeyPairSync } from "node:crypto";
import { open } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const requestedPath = process.argv[2];
if (!requestedPath || !isAbsolute(requestedPath)) {
  throw new Error("Informe um caminho absoluto novo para salvar o par de chaves.");
}

const pair = generateKeyPairSync("ed25519");
const keys = {
  privateKey: pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  publicKey: pair.publicKey.export({ format: "der", type: "spki" }).toString("base64")
};

const outputPath = resolve(requestedPath);
const file = await open(outputPath, "wx", 0o600);
try {
  await file.writeFile(
    `AUDIT_PRIVATE_KEY=${keys.privateKey}\nAUDIT_PUBLIC_KEY=${keys.publicKey}\n`,
    { encoding: "utf8" }
  );
  await file.chmod(0o600);
} finally {
  await file.close();
}

console.log(`Par de chaves salvo sem exibir o material privado: ${outputPath}`);
