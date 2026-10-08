import { describe, expect, it } from "vitest";
import { TimeoutError, withTimeout } from "@/utils/withTimeout";

describe("withTimeout", () => {
  it("passes the result through when the work finishes in time", async () => {
    await expect(withTimeout(Promise.resolve(42), 100, "work")).resolves.toBe(42);
  });

  it("passes the work's own error through", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 100, "work")).rejects.toThrow("boom");
  });

  it("rejects with a TimeoutError naming the operation when the work hangs", async () => {
    const hangs = new Promise<never>(() => undefined);

    const started = Date.now();
    await expect(withTimeout(hangs, 50, "Redis ping")).rejects.toMatchObject({
      name: "TimeoutError",
      message: "Redis ping timed out after 50ms",
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(new TimeoutError("x", 1)).toBeInstanceOf(Error);
  });
});
