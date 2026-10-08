import { expect, vi } from "vitest";
import { redisClient } from "@/lib/redis";

export async function waitForRedisReady(timeoutMs = 5_000): Promise<void> {
  await vi.waitFor(() => expect(redisClient.status).toBe("ready"), { timeout: timeoutMs, interval: 20 });
}
