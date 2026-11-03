import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { app } from "./app.ts";
import { closeDatabase, verifyDatabaseConnection } from "./config/database.ts";
import { env } from "./config/env.ts";
import { runAuctionCycle, startScheduler, stopScheduler } from "./jobs/auction-scheduler.ts";
import { recoverPendingAudits } from "./modules/audit/audit.service.ts";
import { closeSockets, createSocketServer } from "./realtime/socket.server.ts";
import { log } from "./shared/logger.ts";

await mkdir(env.auditDir, { recursive: true });
await mkdir(env.coverDir, { recursive: true });
await verifyDatabaseConnection();
await recoverPendingAudits();
await runAuctionCycle();

const server = createServer(app);
createSocketServer(server);
startScheduler();
server.listen(env.PORT, "127.0.0.1", () => {
  log("info", "server.started", { port: env.PORT });
});

let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log("info", "server.stopping", { signal });
  stopScheduler();
  void Promise.resolve(closeSockets()).finally(() => {
    server.close(() => {
      void closeDatabase().finally(() => process.exit(0));
    });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
