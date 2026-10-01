import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/app";
import { closeDb } from "@/db/client";
import { seedTestFixtures, TEST_CLIENT_EMAIL, TEST_CLIENT_FIRST_NAME, TEST_CLIENT_LAST_NAME } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";

vi.mock("@/queue/pdfQueue", () => ({
  pdfQueue: { add: vi.fn(async () => ({}) as never) },
}));

const app = createApp();

beforeAll(async () => {
  await seedTestFixtures();
});

beforeEach(async () => {
  await truncateInvoiceTables();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/invoices/:id", () => {
  it("returns status, line items, and client/company data from the billing snapshot", async () => {
    const created = await request(app)
      .post("/api/invoices")
      .send({
        email: TEST_CLIENT_EMAIL,
        notes: "See you soon",
        items: [
          { description: "Design", quantity: 1, unitAmountMinor: 40_000 },
          { description: "Development", quantity: 5, unitAmountMinor: 10_000 },
        ],
      });
    expect(created.status).toBe(202);

    const response = await request(app).get(`/api/invoices/${created.body.invoiceId}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("PENDING");
    expect(response.body.totalMinor).toBe(90_000);
    expect(response.body.client.firstName).toBe(TEST_CLIENT_FIRST_NAME);
    expect(response.body.client.lastName).toBe(TEST_CLIENT_LAST_NAME);
    expect(response.body.client.company).toEqual({
      name: "Integration Test Co",
      address: "1 Integration Avenue, Testville, 00000, Testland",
    });
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0]).toMatchObject({ position: 1, description: "Design", amountMinor: 40_000 });
    expect(response.body.items[1]).toMatchObject({ position: 2, description: "Development", amountMinor: 50_000 });
    expect(response.body.pdfGeneratedAt).toBeNull();
    expect(response.body.sentAt).toBeNull();
  });

  it("returns 404 for an unknown invoice id", async () => {
    const response = await request(app).get("/api/invoices/00000000-0000-4000-8000-000000000000");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("INVOICE_NOT_FOUND");
  });

  it("returns 400 for a malformed id", async () => {
    const response = await request(app).get("/api/invoices/not-a-uuid");
    expect(response.status).toBe(400);
  });
});
