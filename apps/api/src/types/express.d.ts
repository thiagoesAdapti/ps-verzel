import type { UserRole } from "../generated/prisma/enums.ts";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: UserRole;
        sessionId: string;
        name: string;
        email: string;
      };
      requestId?: string;
    }
  }
}

export {};
