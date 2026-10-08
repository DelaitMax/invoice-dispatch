import rateLimit from "express-rate-limit";
import { StatusCodes } from "http-status-codes";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { env } from "@/config/env";
import { redisClient } from "@/lib/redis";
import { logger } from "@/utils/logger";

/**
 * Logs through our own pino logger and re-throws, so `passOnStoreError` below still lets the
 * request through — a Redis outage must never take the API down with it.
 */
function sendCommand(...args: string[]): Promise<RedisReply> {
  const [command, ...rest] = args;

  if (!command) {
    return Promise.reject(new Error("rate limiter sendCommand called with no command"));
  }

  return redisClient.call(command, rest).catch((err: unknown) => {
    logger.warn("Rate limiter's Redis store is unavailable; failing open for this request", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }) as Promise<RedisReply>;
}

export const createInvoiceRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: { error: { message: "Too many requests, please try again later", code: "RATE_LIMITED" } },
  store: new RedisStore({
    prefix: "rl:invoices:",
    sendCommand,
  }),
});

export const createInvoiceUserRateLimiter = rateLimit({
  windowMs: env.USER_INVOICE_RATE_LIMIT_WINDOW_MS,
  limit: env.USER_INVOICE_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "unknown",
  message: {
    error: { message: "Invoice quota for this account exceeded, please try again later", code: "USER_RATE_LIMITED" },
  },
  store: new RedisStore({
    prefix: "rl:invoices-user:",
    sendCommand,
  }),
});

export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: { error: { message: "Too many requests, please try again later", code: "RATE_LIMITED" } },
  store: new RedisStore({
    prefix: "rl:auth:",
    sendCommand,
  }),
});
