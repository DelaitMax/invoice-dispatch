import type { NextFunction, Request, Response } from "express";
import { getClientIp } from "@/utils/getClientIp";
import { resolveRequestId } from "@/utils/requestId";
import { logger } from "@/utils/logger";

const REQUEST_ID_RESPONSE_HEADER = "X-Request-Id";
const NANOS_PER_MS = 1_000_000;

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.requestId = resolveRequestId(req);
  res.setHeader(REQUEST_ID_RESPONSE_HEADER, req.requestId);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / NANOS_PER_MS;
    const meta = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ip: getClientIp(req),
    };
    const message = `${req.method} ${req.originalUrl} ${res.statusCode}`;

    if (res.statusCode >= 500) {
      logger.error(message, meta);
    } else if (res.statusCode >= 400) {
      logger.warn(message, meta);
    } else {
      logger.info(message, meta);
    }
  });

  next();
}
