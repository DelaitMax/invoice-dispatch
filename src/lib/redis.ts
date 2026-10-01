import Redis from "ioredis";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

/**
 * `maxRetriesPerRequest: null` is BullMQ's hard requirement for its blocking commands to work
 * (it throws at startup otherwise) — harmless for the rate limiter and health checks that also
 * share this connection, so one client is enough for the whole process.
 */
export const redisClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisClient.on("error", (err: Error) => {
  logger.error("Redis connection error", { error: err.message });
});
