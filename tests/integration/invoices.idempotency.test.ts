import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/app";
import { db, closeDb } from "@/db/client";
import { invoices } from "@/db/schema";
import { seedTestFixtures, TEST_CLIENT_EMAIL } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";
import { loginAsUser } from "./helpers/auth";

vi.mock("@/queue/pdfQueue", () => ({
  pdfQueue: { add: vi.fn(async () => ({}) as never) },
}));

const app = createApp();
const IDEMPOTENCY_KEY = "integration-idem-key-1";
let authCookie: string;

beforeAll(async () => {
  await seedTestFixtures();
  authCookie = await loginAsUser(app);
});

beforeEach(async () => {
  await truncateInvoiceTables();
});

afterAll(async () => {
  await closeDb();
});

describe("Idempotency-Key", () => {
  it("replaying the same key with the same body returns 200 and exactly one invoice row", async () => {
    const body = {
      email: TEST_CLIENT_EMAIL,
      items: [{ description: "Consulting", quantity: 1, unitAmountMinor: 5000 }],
    };

    const first = await request(app)
      .post("/api/invoices")
      .set("Cookie", authCookie)
      .set("Idempotency-Key", IDEMPOTENCY_KEY)
      .send(body);
    expect(first.status).toBe(202);

    const second = await request(app)
      .post("/api/invoices")
      .set("Cookie", authCookie)
      .set("Idempotency-Key", IDEMPOTENCY_KEY)
      .send(body);
    expect(second.status).toBe(200);
    expect(second.body.invoiceId).toBe(first.body.invoiceId);

    const rows = await db.select().from(invoices).where(eq(invoices.idempotencyKey, IDEMPOTENCY_KEY));
    expect(rows).toHaveLength(1);
  });

  it("replaying the same key with a different body returns 409", async () => {
    const first = await request(app)
      .post("/api/invoices")
      .set("Cookie", authCookie)
      .set("Idempotency-Key", IDEMPOTENCY_KEY)
      .send({ email: TEST_CLIENT_EMAIL, items: [{ description: "A", quantity: 1, unitAmountMinor: 100 }] });
    expect(first.status).toBe(202);

    const second = await request(app)
      .post("/api/invoices")
      .set("Cookie", authCookie)
      .set("Idempotency-Key", IDEMPOTENCY_KEY)
      .send({ email: TEST_CLIENT_EMAIL, items: [{ description: "Different", quantity: 2, unitAmountMinor: 999 }] });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("IDEMPOTENCY_KEY_CONFLICT");

    const rows = await db.select().from(invoices).where(eq(invoices.idempotencyKey, IDEMPOTENCY_KEY));
    expect(rows).toHaveLength(1);
  });
});
