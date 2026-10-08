import { sql } from "drizzle-orm";
import type Redis from "ioredis";
import { env } from "@/config/env";
import type { Database } from "@/db/client";
import { withTimeout } from "@/utils/withTimeout";

export type ComponentStatus = "ok" | "error";

export interface ReadinessResult {
  readonly status: ComponentStatus;
  readonly components: {
    readonly database: ComponentStatus;
    readonly redis: ComponentStatus;
  };
}

async function isDatabaseUp(db: Database, timeoutMs: number): Promise<boolean> {
  try {
    await withTimeout(Promise.resolve(db.execute(sql`select 1`)), timeoutMs, "Database readiness probe");
    return true;
  } catch {
    return false;
  }
}

async function isRedisUp(redis: Redis, timeoutMs: number): Promise<boolean> {
  try {
    await withTimeout(redis.ping(), timeoutMs, "Redis readiness probe");
    return true;
  } catch {
    return false;
  }
}

export async function checkReadiness(
  db: Database,
  redis: Redis,
  timeoutMs: number = env.HEALTH_CHECK_TIMEOUT_MS,
): Promise<ReadinessResult> {
  const [databaseUp, redisUp] = await Promise.all([isDatabaseUp(db, timeoutMs), isRedisUp(redis, timeoutMs)]);

  return {
    status: databaseUp && redisUp ? "ok" : "error",
    components: {
      database: databaseUp ? "ok" : "error",
      redis: redisUp ? "ok" : "error",
    },
  };
}
