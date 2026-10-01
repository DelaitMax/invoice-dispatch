import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/app";
import { closeDb } from "@/db/client";
import { redisClient } from "@/lib/redis";

vi.mock("@/queue/pdfQueue", () => ({
  pdfQueue: { add: vi.fn(async () => ({}) as never) },
}));

const app = createApp();

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /health", () => {
  it("returns 200 with no dependency access at all, even when Redis is unreachable", async () => {
    vi.spyOn(redisClient, "ping").mockRejectedValue(new Error("should never be called"));

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(typeof response.body.timestamp).toBe("string");
    expect(redisClient.ping).not.toHaveBeenCalled();
  });
});

describe("GET /health/ready", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 when both Postgres and Redis are reachable", async () => {
    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", components: { database: "ok", redis: "ok" } });
  });

  it("returns 503 with a component breakdown when Redis is down", async () => {
    vi.spyOn(redisClient, "ping").mockRejectedValue(new Error("connection refused"));

    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "error", components: { database: "ok", redis: "error" } });
  });
});
