import type { WorkspaceRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      cookies?: Record<string, string>;
      auth?: {
        userId: string;
        workspaceId: string;
        role: WorkspaceRole;
        name: string;
        email: string;
      };
    }
  }
}

export {};
