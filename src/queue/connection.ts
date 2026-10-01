import Redis from "ioredis";
import { env } from "@/config/env";

/**
 * Each Queue and Worker gets its own connection rather than sharing src/lib/redis.ts
 * (BullMQ's own recommendation): a Worker's blocking commands must never be able to stall
 * the rate limiter or another queue that happens to share a connection.
 * `maxRetriesPerRequest: null` is BullMQ's hard requirement for those blocking commands.
 */
export function createQueueConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
