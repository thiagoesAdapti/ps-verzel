import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

export const projectRoot = resolve(
  fileURLToPath(new URL("../", import.meta.url))
);
loadEnv({ path: resolve(projectRoot, ".env") });

export const E2E_DATABASE_NAME = "auction_house_entregavel_e2e";
export const E2E_API_PORT = 3310;
export const E2E_WEB_PORT = 5374;
export const E2E_CATALOG_PORT = 3311;

function database(value: string, variable: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variable} não é uma URL PostgreSQL válida.`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${variable} deve usar o protocolo PostgreSQL.`);
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!name) throw new Error(`${variable} não informa o nome do banco.`);
  return { url, name };
}

export function resolveE2eDatabaseUrl() {
  const developmentValue = process.env.DATABASE_URL?.trim();
  const integrationValue = process.env.TEST_DATABASE_URL?.trim();
  const e2eValue = process.env.E2E_DATABASE_URL?.trim();
  if (!developmentValue || !integrationValue || !e2eValue) {
    throw new Error(
      "DATABASE_URL, TEST_DATABASE_URL e E2E_DATABASE_URL são obrigatórias antes de preparar o E2E."
    );
  }

  const development = database(developmentValue, "DATABASE_URL");
  const integration = database(integrationValue, "TEST_DATABASE_URL");
  const e2e = database(e2eValue, "E2E_DATABASE_URL");
  if (development.name !== "auction_house_entregavel_dev") {
    throw new Error(
      "DATABASE_URL deve apontar exclusivamente para auction_house_entregavel_dev."
    );
  }
  if (integration.name !== "auction_house_entregavel_test") {
    throw new Error(
      "TEST_DATABASE_URL deve apontar exclusivamente para auction_house_entregavel_test."
    );
  }
  if (e2e.name !== E2E_DATABASE_NAME) {
    throw new Error(
      `E2E_DATABASE_URL deve apontar exclusivamente para ${E2E_DATABASE_NAME}.`
    );
  }
  if (
    new Set([development.name, integration.name, e2e.name]).size !== 3 ||
    e2e.url.toString() === development.url.toString() ||
    e2e.url.toString() === integration.url.toString()
  ) {
    throw new Error(
      "Os bancos de desenvolvimento, integração e E2E devem ser distintos."
    );
  }
  return e2e.url.toString();
}

const databaseUrl = resolveE2eDatabaseUrl();
const apiOrigin = `http://127.0.0.1:${E2E_API_PORT}`;
const webOrigin = `http://127.0.0.1:${E2E_WEB_PORT}`;
const catalogOrigin = `http://127.0.0.1:${E2E_CATALOG_PORT}`;

function definedEnvironment(
  values: NodeJS.ProcessEnv
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  );
}

const commonEnvironment = definedEnvironment({
  ...process.env,
  NODE_ENV: "e2e",
  E2E_DATABASE_URL: databaseUrl,
  APP_ORIGIN: webOrigin,
  OPEN_LIBRARY_SEARCH_URL: `${catalogOrigin}/search.json`,
  OPEN_LIBRARY_COVERS_URL: `${catalogOrigin}/covers`,
  AUDIT_ANCHOR_DIR: "./data/audit/anchors/e2e",
  COVER_STORAGE_DIR: "./data/covers/e2e"
});

export const e2eRuntime = {
  databaseUrl,
  apiOrigin,
  webOrigin,
  catalogOrigin,
  webPort: E2E_WEB_PORT,
  prismaEnvironment: definedEnvironment({
    ...commonEnvironment,
    DATABASE_URL: databaseUrl
  }),
  catalogEnvironment: definedEnvironment({
    ...commonEnvironment,
    PORT: String(E2E_CATALOG_PORT)
  }),
  apiEnvironment: definedEnvironment({
    ...commonEnvironment,
    PORT: String(E2E_API_PORT)
  }),
  webEnvironment: definedEnvironment({
    ...commonEnvironment,
    API_PROXY_TARGET: apiOrigin
  })
};
