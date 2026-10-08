import type Redis from "ioredis";
import { describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { checkReadiness } from "@/services/health.service";

const hang = () => new Promise<never>(() => undefined);
const okDb = { execute: async () => [] } as unknown as Database;

describe("checkReadiness probe deadlines", () => {
  it("reports Redis as down — and still answers — when ping never returns", async () => {
    const redis = { ping: hang } as unknown as Redis;

    const started = Date.now();
    const result = await checkReadiness(okDb, redis, 50);

    expect(Date.now() - started).toBeLessThan(1000);
    expect(result).toEqual({ status: "error", components: { database: "ok", redis: "error" } });
  });

  it("reports the database as down when its probe hangs, without hiding that Redis is fine", async () => {
    const hungDb = { execute: hang } as unknown as Database;
    const redis = { ping: async () => "PONG" } as unknown as Redis;

    const result = await checkReadiness(hungDb, redis, 50);

    expect(result).toEqual({ status: "error", components: { database: "error", redis: "ok" } });
  });
});
