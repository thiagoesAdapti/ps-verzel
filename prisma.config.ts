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
    : "development";
const databaseUrl = assertDatabaseUrl(requiredEnv("DATABASE_URL"), target);

export default defineConfig({
  schema: resolve(root, "prisma/schema.prisma"),
  migrations: {
    path: resolve(root, "prisma/migrations"),
    seed: "tsx prisma/seed.ts"
  },
  datasource: { url: databaseUrl }
});
