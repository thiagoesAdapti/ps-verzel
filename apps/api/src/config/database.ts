import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { env } from "./env.ts";

const adapter = new PrismaPg({
  connectionString: env.databaseUrl,
  options: "-c timezone=UTC",
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000
});

export const prisma: PrismaClient<"error"> = new PrismaClient({
  adapter,
  log: ["error"]
});

export type TransactionClient = Omit<
  PrismaClient<"error">,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export function transaction<T>(
  work: (tx: TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: import("../generated/prisma/internal/prismaNamespace.ts").TransactionIsolationLevel;
  }
) {
  return prisma.$transaction(work as never, options) as Promise<T>;
}

export async function verifyDatabaseConnection() {
  const expected = new URL(env.databaseUrl).pathname.replace(/^\//, "");
  const rows = await prisma.$queryRaw<Array<{ current_database: string; timezone: string }>>`
    SELECT current_database(), current_setting('TIMEZONE') AS timezone
  `;
  const active = rows[0];
  if (active?.current_database !== expected) {
    throw new Error(`Conexao recusada: banco ativo ${active?.current_database ?? "desconhecido"}.`);
  }
  if (active.timezone.toUpperCase() !== "UTC") {
    throw new Error(`Conexao recusada: timezone ${active.timezone}, esperado UTC.`);
  }
  return active;
}

export async function closeDatabase() {
  await prisma.$disconnect();
}
