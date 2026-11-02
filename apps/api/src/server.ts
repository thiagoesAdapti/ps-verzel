import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { app } from "./app.ts";
import { env } from "./config/env.ts";
import { log } from "./shared/logger.ts";

await mkdir(env.auditDir, { recursive: true });
await mkdir(env.coverDir, { recursive: true });

const server = createServer(app);
server.listen(env.PORT, "127.0.0.1", () => {
  log("info", "server.started", { port: env.PORT });
});

let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log("info", "server.stopping", { signal });
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
