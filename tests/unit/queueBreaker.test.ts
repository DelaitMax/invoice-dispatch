import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueueBreaker } from "@/queue/queueBreaker";

function setup(overrides: { pause?: () => Promise<void> } = {}) {
  const queue = {
    name: "email",
    pause: vi.fn(overrides.pause ?? (async () => undefined)),
    resume: vi.fn(async () => undefined),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const breaker = createQueueBreaker({ queue: queue as never, pauseMs: 60_000, logger: logger as never });
  return { queue, logger, breaker };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createQueueBreaker", () => {
  it("pauses the queue once and raises one alert, however many jobs trip it", async () => {
    const { queue, logger, breaker } = setup();

    await Promise.all([breaker.trip("401"), breaker.trip("401"), breaker.trip("401")]);

    expect(queue.pause).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("ALERT"),
      expect.objectContaining({ alert: "QUEUE_PAUSED", queue: "email", reason: "401" }),
    );
  });

  it("resumes the queue by itself after the pause, and can trip again if the problem is still there", async () => {
    const { queue, breaker } = setup();

    await breaker.trip("401");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(queue.resume).toHaveBeenCalledTimes(1);

    await breaker.trip("401 again");
    expect(queue.pause).toHaveBeenCalledTimes(2);
  });

  it("does not resume early, and dispose() cancels the pending resume", async () => {
    const { queue, breaker } = setup();

    await breaker.trip("403");
    await vi.advanceTimersByTimeAsync(59_000);
    expect(queue.resume).not.toHaveBeenCalled();

    breaker.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(queue.resume).not.toHaveBeenCalled();
  });

  it("an explicit resume() (a worker restart) un-pauses at once and cancels the timer", async () => {
    const { queue, breaker } = setup();
    await breaker.trip("401");

    await breaker.resume();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(queue.resume).toHaveBeenCalledTimes(1);
  });

  it("still schedules the resume (and does not throw) when pausing itself fails", async () => {
    const { queue, logger, breaker } = setup({ pause: async () => Promise.reject(new Error("redis down")) });

    await expect(breaker.trip("401")).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Failed to pause"), expect.anything());
    expect(queue.resume).toHaveBeenCalledTimes(1);
  });
});
