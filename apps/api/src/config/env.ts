import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

export const projectRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
loadEnv({ path: resolve(projectRoot, ".env") });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "e2e", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3300),
  APP_ORIGIN: z.url().default("http://localhost:5373"),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  E2E_DATABASE_URL: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32),
  AUDIT_PRIVATE_KEY: z.string().min(1),
  AUDIT_PUBLIC_KEY: z.string().min(1),
  AUDIT_ANCHOR_DIR: z.string().default("./data/audit/anchors"),
  COVER_STORAGE_DIR: z.string().default("./data/covers"),
  OPEN_LIBRARY_CONTACT_EMAIL: z.email(),
  OPEN_LIBRARY_SEARCH_URL: z.url().default("https://openlibrary.org/search.json"),
  OPEN_LIBRARY_COVERS_URL: z.url().default("https://covers.openlibrary.org")
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Configuracao invalida: ${z.prettifyError(parsed.error)}`);
}

const PRODUCTION_ORIGIN = "https://leilao.figueiredo.tech";
const PRODUCTION_DATABASE = "auction_house_leilao_prod";
const EXAMPLE_SESSION_SECRET = "generate-a-new-secret-with-at-least-32-random-characters";

function requireDatabase(value: string, expected: string, label: string) {
  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new Error(`${label} deve ser uma URL PostgreSQL valida.`);
  }
  if (target.protocol !== "postgresql:" && target.protocol !== "postgres:") {
    throw new Error(`${label} deve usar o protocolo PostgreSQL.`);
  }
  const database = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (database !== expected) {
    throw new Error(`${label} deve apontar exclusivamente para ${expected}.`);
  }
  return value;
}

const primaryDatabase = parsed.data.NODE_ENV === "production"
  ? PRODUCTION_DATABASE
  : "auction_house_entregavel_dev";
const primaryUrl = requireDatabase(
  parsed.data.DATABASE_URL,
  primaryDatabase,
  "DATABASE_URL"
);
const testUrl = parsed.data.TEST_DATABASE_URL
  ? requireDatabase(parsed.data.TEST_DATABASE_URL, "auction_house_entregavel_test", "TEST_DATABASE_URL")
  : undefined;
const e2eUrl = parsed.data.E2E_DATABASE_URL
  ? requireDatabase(parsed.data.E2E_DATABASE_URL, "auction_house_entregavel_e2e", "E2E_DATABASE_URL")
  : undefined;

if (parsed.data.NODE_ENV === "test" && !testUrl) {
  throw new Error("TEST_DATABASE_URL e obrigatoria nos testes de integracao.");
}
if (parsed.data.NODE_ENV === "e2e" && !e2eUrl) {
  throw new Error("E2E_DATABASE_URL e obrigatoria nos testes E2E.");
}
if (parsed.data.NODE_ENV === "production") {
  if (parsed.data.APP_ORIGIN !== PRODUCTION_ORIGIN) {
    throw new Error(`APP_ORIGIN deve ser exatamente ${PRODUCTION_ORIGIN} em producao.`);
  }
  if (parsed.data.PORT !== 3300) {
    throw new Error("PORT deve ser 3300 em producao.");
  }
  if (parsed.data.SESSION_SECRET === EXAMPLE_SESSION_SECRET) {
    throw new Error("SESSION_SECRET de exemplo nao pode ser usado em producao.");
  }
}

const configuredUrls = [primaryUrl, testUrl, e2eUrl].filter((value): value is string => Boolean(value));
if (new Set(configuredUrls).size !== configuredUrls.length) {
  throw new Error("Os bancos configurados para cada ambiente devem ser distintos.");
}

const databaseUrl = parsed.data.NODE_ENV === "test"
  ? testUrl!
  : parsed.data.NODE_ENV === "e2e"
    ? e2eUrl!
    : primaryUrl;

function localDirectory(value: string, label: string) {
  const target = resolve(projectRoot, value);
  if (target === projectRoot || !target.startsWith(projectRoot + sep)) {
    throw new Error(`${label} deve permanecer dentro da raiz do repositorio de destino.`);
  }
  return target;
}

export const env = {
  ...parsed.data,
  DATABASE_URL: primaryUrl,
  TEST_DATABASE_URL: testUrl,
  E2E_DATABASE_URL: e2eUrl,
  databaseUrl,
  auditDir: localDirectory(parsed.data.AUDIT_ANCHOR_DIR, "AUDIT_ANCHOR_DIR"),
  coverDir: localDirectory(parsed.data.COVER_STORAGE_DIR, "COVER_STORAGE_DIR")
};
