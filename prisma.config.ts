import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
loadEnv({ path: resolve(root, ".env") });

export default defineConfig({
  schema: resolve(root, "prisma/schema.prisma"),
  migrations: {
    path: resolve(root, "prisma/migrations"),
    seed: "tsx prisma/seed.ts"
  },
  datasource: { url: env("DATABASE_URL") }
});
