import { Client } from "pg";

export const DATABASE_NAMES = {
  development: "auction_house_entregavel_dev",
  test: "auction_house_entregavel_test",
  e2e: "auction_house_entregavel_e2e"
} as const;

export type DatabaseTarget = keyof typeof DATABASE_NAMES;

export function databaseName(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} deve ser uma URL PostgreSQL valida.`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${label} deve usar o protocolo PostgreSQL.`);
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!name) throw new Error(`${label} deve informar o banco explicitamente.`);
  return name;
}

export function assertDatabaseUrl(value: string, target: DatabaseTarget, label = "DATABASE_URL") {
  const expected = DATABASE_NAMES[target];
  const actual = databaseName(value, label);
  if (actual !== expected) {
    throw new Error(`${label} deve apontar exclusivamente para ${expected}; recebido ${actual}.`);
  }
  return value;
}

export async function confirmActiveDatabase(
  connectionString: string,
  target: DatabaseTarget
) {
  const expected = DATABASE_NAMES[target];
  assertDatabaseUrl(connectionString, target);
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
  await client.connect();
  try {
    const result = await client.query<{ current_database: string }>("SELECT current_database()");
    const actual = result.rows[0]?.current_database;
    if (actual !== expected) {
      throw new Error(`Operacao recusada: conexao ativa em ${actual ?? "desconhecido"}, esperado ${expected}.`);
    }
  } finally {
    await client.end();
  }
  return expected;
}
