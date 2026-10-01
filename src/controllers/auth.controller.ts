import type { CookieOptions, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { env } from "@/config/env";
import { db } from "@/db/client";
import * as authService from "@/services/auth.service";
import { AppError } from "@/utils/AppError";
import { signAuthToken } from "@/utils/jwt";
import { loginSchema, registerSchema } from "@/schemas/auth.schema";

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env.JWT_EXPIRES_IN_SECONDS * 1000,
  };
}

function userResponse(user: { id: string; email: string; role: string }) {
  return { id: user.id, email: user.email, role: user.role };
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = loginSchema.parse(req.body);
  const user = await authService.authenticate(db, email, password);

  const token = signAuthToken({ sub: user.id, email: user.email, role: user.role });
  res.cookie(env.JWT_COOKIE_NAME, token, cookieOptions());

  res.json(userResponse(user));
}

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = registerSchema.parse(req.body);
  const user = await authService.registerUser(db, email, password);

  const token = signAuthToken({ sub: user.id, email: user.email, role: user.role });
  res.cookie(env.JWT_COOKIE_NAME, token, cookieOptions());

  res.status(StatusCodes.CREATED).json(userResponse(user));
}

export function logoutHandler(_req: Request, res: Response): void {
  res.clearCookie(env.JWT_COOKIE_NAME, { path: "/" });
  res.status(StatusCodes.NO_CONTENT).send();
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw AppError.unauthorized("Authentication required", "NOT_AUTHENTICATED");
  }

  const user = await authService.getUserById(db, req.user.id);
  if (!user) {
    throw AppError.unauthorized("User no longer exists", "USER_NOT_FOUND");
  }

  res.json(userResponse(user));
}
