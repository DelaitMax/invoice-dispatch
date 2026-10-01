import type { NextFunction, Request, Response } from "express";
import { env } from "@/config/env";
import { AppError } from "@/utils/AppError";
import { verifyAuthToken, type UserRole } from "@/utils/jwt";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[env.JWT_COOKIE_NAME] as string | undefined;

  if (!token) {
    next(AppError.unauthorized("Authentication required", "NOT_AUTHENTICATED"));
    return;
  }

  const payload = verifyAuthToken(token);
  if (!payload) {
    next(AppError.unauthorized("Invalid or expired session", "INVALID_SESSION"));
    return;
  }

  req.user = { id: payload.sub, email: payload.email, role: payload.role };
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    next(AppError.forbidden("Admin access required", "ADMIN_REQUIRED"));
    return;
  }
  next();
}
