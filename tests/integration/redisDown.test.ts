import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("REDIS_URL", "redis://127.0.0.1:1");
});

import { createApp } from "@/app";
import { closeDb, db } from "@/db/client";
import { invoices } from "@/db/schema";
import { redisClient } from "@/lib/redis";
import { emailQueue } from "@/queue/emailQueue";
import { pdfQueue } from "@/queue/pdfQueue";
import { insertUser } from "@/repositories/users.repository";
import { hashPassword } from "@/utils/password";
import { seedTestFixtures, TEST_CLIENT_EMAIL } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";

const FAST_ENOUGH_MS = 4_000;

const app = createApp();
const email = `redis-down-${crypto.randomUUID()}@example.com`;
const password = "a-good-password-1";

async function timed<T>(call: PromiseLike<T>): Promise<{ response: T; ms: number }> {
  const started = Date.now();
  const response = await call;
  return { response, ms: Date.now() - started };
}

beforeAll(async () => {
  await seedTestFixtures();
  await truncateInvoiceTables();
  await insertUser(db, { email, passwordHash: await hashPassword(password), role: "user" });
}, 30_000);

afterAll(async () => {
  redisClient.disconnect();
  await pdfQueue.close().catch(() => undefined);
  await emailQueue.close().catch(() => undefined);
  await closeDb();
}, 30_000);

describe("with Redis unreachable", () => {
  it("login still answers (the auth rate limiter fails open)", async () => {
    const { response, ms } = await timed(request(app).post("/auth/login").send({ email, password }));

    expect(response.status).toBe(200);
    expect(ms).toBeLessThan(FAST_ENOUGH_MS);
  });

  it("registration still answers", async () => {
    const { response, ms } = await timed(
      request(app)
        .post("/auth/register")
        .send({ email: `fresh-${crypto.randomUUID()}@example.com`, password }),
    );

    expect(response.status).toBe(201);
    expect(ms).toBeLessThan(FAST_ENOUGH_MS);
  });

  it("creating an invoice answers 202 promptly and the invoice is safely committed for the sweeper to pick up", async () => {
    const login = await request(app).post("/auth/login").send({ email, password });
    const cookie = login.headers["set-cookie"] as unknown as string[];

    const { response, ms } = await timed(
      request(app)
        .post("/api/invoices")
        .set("Cookie", cookie)
        .send({
          email: TEST_CLIENT_EMAIL,
          items: [{ description: "Redis is down", quantity: 1, unitAmountMinor: 100 }],
        }),
    );

    expect(response.status).toBe(202);
    expect(ms).toBeLessThan(FAST_ENOUGH_MS);
    const [row] = await db.select().from(invoices).where(eq(invoices.id, response.body.invoiceId));
    expect(row?.status).toBe("PENDING");
  });

  it("/health/ready reports 503 with Redis as the failing component, quickly", async () => {
    const { response, ms } = await timed(request(app).get("/health/ready"));

    expect(response.status).toBe(503);
    expect(response.body.components).toEqual({ database: "ok", redis: "error" });
    expect(ms).toBeLessThan(FAST_ENOUGH_MS);
  });

  it("liveness is unaffected", async () => {
    expect((await request(app).get("/health")).status).toBe(200);
  });
});
