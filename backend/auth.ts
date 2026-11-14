import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";

type SessionClaims = jwt.JwtPayload & { workspaceId: string };

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  return value;
}

export function issueSession(userId: string, workspaceId: string) {
  return jwt.sign({ workspaceId }, secret(), { subject: userId, expiresIn: "7d" });
}

export async function requireSession(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.sg_session as string | undefined;
    if (!token) {
      res.status(401).json({ error: { code: "unauthenticated", message: "Sign in to continue." } });
      return;
    }
    const claims = jwt.verify(token, secret()) as SessionClaims;
    if (!claims.sub || !claims.workspaceId) throw new Error("Invalid session claims.");
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: claims.sub, workspaceId: claims.workspaceId } },
      include: { user: true, workspace: true },
    });
    if (!membership) {
      res.status(401).json({ error: { code: "session_revoked", message: "Your workspace access has changed. Sign in again." } });
      return;
    }
    req.auth = {
      userId: membership.userId,
      workspaceId: membership.workspaceId,
      role: membership.role,
      name: membership.user.name,
      email: membership.user.email,
    };
    next();
  } catch {
    res.clearCookie("sg_session", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
    res.status(401).json({ error: { code: "invalid_session", message: "Your session has expired. Sign in again." } });
  }
}

export function requireRole(...allowed: Array<"OWNER" | "ADMIN" | "ANALYST" | "VIEWER">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !allowed.includes(req.auth.role)) {
      res.status(403).json({ error: { code: "forbidden", message: "Your workspace role cannot perform this action." } });
      return;
    }
    next();
  };
}

export function setSessionCookie(res: Response, token: string, rememberMe = true) {
  res.cookie("sg_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...(rememberMe ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}),
    path: "/",
  });
}
