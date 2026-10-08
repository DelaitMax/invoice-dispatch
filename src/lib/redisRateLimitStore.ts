import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";
import type Redis from "ioredis";
import { logger } from "@/utils/logger";

const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if hits == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { hits, ttl }
`;

type RedisLike = Pick<Redis, "eval" | "decr" | "del" | "get" | "pttl">;

export class RedisFixedWindowStore implements Store {
  readonly prefix: string;
  private windowMs = 0;

  constructor(
    private readonly redis: RedisLike,
    prefix: string,
  ) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    return this.guard(async () => {
      const [hits, ttlMs] = (await this.redis.eval(INCREMENT_SCRIPT, 1, this.k(key), this.windowMs)) as [
        number,
        number,
      ];
      return { totalHits: hits, resetTime: new Date(Date.now() + ttlMs) };
    });
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    return this.guard(async () => {
      const [raw, ttlMs] = await Promise.all([this.redis.get(this.k(key)), this.redis.pttl(this.k(key))]);
      if (raw === null || ttlMs < 0) {
        return undefined;
      }
      return { totalHits: Number(raw), resetTime: new Date(Date.now() + ttlMs) };
    });
  }

  async decrement(key: string): Promise<void> {
    await this.guard(async () => {
      await this.redis.decr(this.k(key));
    });
  }

  async resetKey(key: string): Promise<void> {
    await this.guard(async () => {
      await this.redis.del(this.k(key));
    });
  }

  private k(key: string): string {
    return `${this.prefix}${key}`;
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (err) {
      logger.warn("Rate limiter's Redis store is unavailable; failing open for this request", {
        prefix: this.prefix,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
