import { sql } from "drizzle-orm";
import type Redis from "ioredis";
import type { Database } from "@/db/client";

export type ComponentStatus = "ok" | "error";

export interface ReadinessResult {
  readonly status: ComponentStatus;
  readonly components: {
    readonly database: ComponentStatus;
    readonly redis: ComponentStatus;
  };
}

async function isDatabaseUp(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

async function isRedisUp(redis: Redis): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

export async function checkReadiness(db: Database, redis: Redis): Promise<ReadinessResult> {
  const [databaseUp, redisUp] = await Promise.all([isDatabaseUp(db), isRedisUp(redis)]);

  return {
    status: databaseUp && redisUp ? "ok" : "error",
    components: {
      database: databaseUp ? "ok" : "error",
      redis: redisUp ? "ok" : "error",
    },
  };
}
