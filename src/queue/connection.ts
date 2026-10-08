import Redis from "ioredis";
import { env } from "@/config/env";
import { createFailFastRedis } from "@/lib/redis";

export function createWorkerConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export function createProducerConnection(): Redis {
  return createFailFastRedis();
}
