import type { Request } from "express";

const FORWARDED_FOR_HEADER = "x-forwarded-for";

/**
 * With `app.set("trust proxy", ...)` configured, req.ip already resolves X-Forwarded-For
 * correctly — this is a defensive fallback for logging when that isn't set up (e.g. running
 * the app directly, without a reverse proxy in front of it), so logs never silently show the
 * proxy's own address instead of the caller's.
 */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers[FORWARDED_FOR_HEADER];
  const first = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;

  if (typeof first === "string" && first.trim().length > 0) {
    return first.split(",")[0]?.trim() ?? req.ip ?? "unknown";
  }

  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}
