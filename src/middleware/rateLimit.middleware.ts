import rateLimit from "express-rate-limit";
import { StatusCodes } from "http-status-codes";
import { env } from "@/config/env";
import { redisClient } from "@/lib/redis";
import { RedisFixedWindowStore } from "@/lib/redisRateLimitStore";

export const createInvoiceRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: { error: { message: "Too many requests, please try again later", code: "RATE_LIMITED" } },
  store: new RedisFixedWindowStore(redisClient, "rl:invoices:"),
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
  store: new RedisFixedWindowStore(redisClient, "rl:invoices-user:"),
});

export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: { error: { message: "Too many requests, please try again later", code: "RATE_LIMITED" } },
  store: new RedisFixedWindowStore(redisClient, "rl:auth:"),
});
