import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "@/config/env";
import { AppError } from "@/utils/AppError";

const API_KEY_HEADER = "x-api-key";

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}

export function apiKeyMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!env.API_KEY) {
    next();
    return;
  }

  const header = req.headers[API_KEY_HEADER];
  const provided = Array.isArray(header) ? header[0] : header;

  if (typeof provided !== "string" || !safeEqual(provided, env.API_KEY)) {
    next(AppError.unauthorized("Missing or invalid API key", "UNAUTHORIZED"));
    return;
  }

  next();
}
