import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";
import { env } from "../config/env.ts";

let io: Server | undefined;

export function createSocketServer(server: HttpServer) {
  io = new Server(server, {
    path: "/socket.io",
    cors: { origin: env.APP_ORIGIN, credentials: true }
  });
  io.on("connection", (socket) => {
    socket.on("lot:join", (payload, acknowledge?: (result: { ok: boolean }) => void) => {
      const result = z.object({ lotId: z.uuid() }).safeParse(payload);
      if (!result.success) return acknowledge?.({ ok: false });
      void Promise.resolve(socket.join(`lot:${result.data.lotId}`))
        .then(() => acknowledge?.({ ok: true }));
    });
    socket.on("lot:leave", (payload, acknowledge?: (result: { ok: boolean }) => void) => {
      const result = z.object({ lotId: z.uuid() }).safeParse(payload);
      if (!result.success) return acknowledge?.({ ok: false });
      void Promise.resolve(socket.leave(`lot:${result.data.lotId}`))
        .then(() => acknowledge?.({ ok: true }));
    });
  });
  return io;
}

export function emitLot(
  event: "bid:accepted" | "lot:extended" | "lot:ended" | "lot:started" | "lot:cancelled",
  lotId: string,
  data: Record<string, unknown>
) {
  io?.to(`lot:${lotId}`).emit(event, { lotId, ...data });
}

export function closeSockets() {
  return io?.close();
}
