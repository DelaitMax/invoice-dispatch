import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { redisClient } from "@/lib/redis";
import { RedisFixedWindowStore } from "@/lib/redisRateLimitStore";
import { waitForRedisReady } from "./helpers/redis";

beforeAll(() => waitForRedisReady());

afterAll(async () => {
  await redisClient.quit();
});

const prefix = () => `rl:test:${crypto.randomUUID()}:`;
const options = (windowMs: number) => ({ windowMs }) as never;

describe("RedisFixedWindowStore (real Redis)", () => {
  it("counts hits within a window and reports when it resets", async () => {
    const store = new RedisFixedWindowStore(redisClient, prefix());
    store.init(options(5_000));

    const first = await store.increment("client-a");
    const second = await store.increment("client-a");

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(second.resetTime!.getTime()).toBeGreaterThan(Date.now());
    expect(second.resetTime!.getTime()).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  it("starts a fresh window once the old one has expired", async () => {
    const store = new RedisFixedWindowStore(redisClient, prefix());
    store.init(options(150));

    await store.increment("client-a");
    await store.increment("client-a");
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect((await store.increment("client-a")).totalHits).toBe(1);
  });

  it("keeps clients and prefixes apart; decrement and resetKey work", async () => {
    const store = new RedisFixedWindowStore(redisClient, prefix());
    const other = new RedisFixedWindowStore(redisClient, prefix());
    store.init(options(5_000));
    other.init(options(5_000));

    await store.increment("a");
    await store.increment("a");
    expect((await store.increment("b")).totalHits).toBe(1);
    expect((await other.increment("a")).totalHits).toBe(1);

    await store.decrement("a");
    expect((await store.get("a"))?.totalHits).toBe(1);

    await store.resetKey("a");
    expect(await store.get("a")).toBeUndefined();
  });

  it("works on its own — no start-up handshake to fail — and rethrows store errors so passOnStoreError can fail open", async () => {
    const broken = {
      eval: vi.fn(async () =>
        Promise.reject(new Error("Stream isn't writeable and enableOfflineQueue options is false")),
      ),
    } as never;
    const store = new RedisFixedWindowStore(broken, prefix());
    store.init(options(1_000));

    await expect(store.increment("x")).rejects.toThrow("enableOfflineQueue");
  });
});
