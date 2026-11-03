import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig, env as requiredEnv } from "prisma/config";
import { assertDatabaseUrl, type DatabaseTarget } from "./scripts/database-safety.ts";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
loadEnv({ path: resolve(root, ".env") });

const target: DatabaseTarget = process.env.NODE_ENV === "test"
  ? "test"
  : process.env.NODE_ENV === "e2e"
    ? "e2e"
    : process.env.NODE_ENV === "production"
      ? "production"
      : "development";

const prismaCommand = process.argv.slice(2).join(" ");
if (
  target === "production" &&
  ["migrate reset", "migrate dev", "db push", "db seed"].some((command) =>
    prismaCommand.includes(command)
  )
) {
  throw new Error(
    "Comando Prisma destrutivo ou demonstrativo bloqueado em producao. Use somente prisma migrate deploy pelo script protegido."
  );
}
const databaseUrl = assertDatabaseUrl(requiredEnv("DATABASE_URL"), target);

export default defineConfig({
  schema: resolve(root, "prisma/schema.prisma"),
  migrations: {
    path: resolve(root, "prisma/migrations"),
    seed: "tsx prisma/seed.ts"
  },
  datasource: { url: databaseUrl }
});
