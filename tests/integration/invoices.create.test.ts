import { asc, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/app";
import { db, closeDb } from "@/db/client";
import { invoiceItems, invoiceRequests, invoices } from "@/db/schema";
import { seedTestFixtures, TEST_CLIENT_EMAIL } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";
import { loginAsUser } from "./helpers/auth";

const pdfQueueAddMock = vi.hoisted(() => vi.fn(async () => ({}) as never));

vi.mock("@/queue/pdfQueue", () => ({
  pdfQueue: { add: pdfQueueAddMock },
}));

const app = createApp();
let authCookie: string;

beforeAll(async () => {
  await seedTestFixtures();
  authCookie = await loginAsUser(app);
});

beforeEach(async () => {
  await truncateInvoiceTables();
  pdfQueueAddMock.mockClear();
});

afterAll(async () => {
  await closeDb();
});

describe("POST /api/invoices", () => {
  it("returns 202 with a server-computed total and creates the invoice, its items, and an accepted audit row", async () => {
    const response = await request(app)
      .post("/api/invoices")
      .set("Cookie", authCookie)
      .send({
        email: TEST_CLIENT_EMAIL,
        items: [
          { description: "Consulting", quantity: 2, unitAmountMinor: 5000 },
          { description: "Support", quantity: 1, unitAmountMinor: 2500 },
        ],
      });

    expect(response.status).toBe(202);
    expect(response.body.totalMinor).toBe(12_500);
    expect(response.body.status).toBe("PENDING");

    const [invoiceRow] = await db.select().from(invoices).where(eq(invoices.id, response.body.invoiceId));
    expect(invoiceRow).toBeDefined();
    expect(invoiceRow?.totalMinor).toBe(12_500);
    expect(invoiceRow?.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);

    const itemRows = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, response.body.invoiceId))
      .orderBy(asc(invoiceItems.position));
    expect(itemRows).toHaveLength(2);
    expect(itemRows[0]?.amountMinor).toBe(10_000);
    expect(itemRows[1]?.amountMinor).toBe(2_500);

    const [requestRow] = await db
      .select()
      .from(invoiceRequests)
      .where(eq(invoiceRequests.invoiceId, response.body.invoiceId));
    expect(requestRow?.outcome).toBe("ACCEPTED");

    expect(pdfQueueAddMock).toHaveBeenCalledTimes(1);
    expect(pdfQueueAddMock).toHaveBeenCalledWith("render", { invoiceId: response.body.invoiceId }, expect.anything());
  });

  it("ignores a client-supplied totalMinor and computes it server-side anyway", async () => {
    const response = await request(app)
      .post("/api/invoices")
      .set("Cookie", authCookie)
      .send({
        email: TEST_CLIENT_EMAIL,
        items: [{ description: "x", quantity: 1, unitAmountMinor: 100 }],
        totalMinor: 999_999,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without a session cookie", async () => {
    const response = await request(app)
      .post("/api/invoices")
      .send({ email: TEST_CLIENT_EMAIL, items: [{ description: "x", quantity: 1, unitAmountMinor: 100 }] });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("NOT_AUTHENTICATED");
  });
});
