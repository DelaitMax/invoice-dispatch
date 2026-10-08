import Redis from "ioredis";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

export function createFailFastRedis(): Redis {
  const client = new Redis(env.REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: env.REDIS_COMMAND_TIMEOUT_MS,
    connectTimeout: 5000,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  });

  client.on("error", (err: Error) => {
    logger.error("Redis connection error", { error: err.message });
  });

  return client;
}

export const redisClient = createFailFastRedis();
