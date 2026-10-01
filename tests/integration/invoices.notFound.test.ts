import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/app";
import { db, closeDb } from "@/db/client";
import { invoiceRequests } from "@/db/schema";
import { seedTestFixtures, UNKNOWN_EMAIL } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";
import { loginAsUser } from "./helpers/auth";

vi.mock("@/queue/pdfQueue", () => ({
  pdfQueue: { add: vi.fn(async () => ({}) as never) },
}));

const app = createApp();
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

describe("POST /api/invoices — unknown client", () => {
  it("returns 404 CLIENT_NOT_FOUND and records the audit row with that outcome", async () => {
    const response = await request(app)
      .post("/api/invoices")
      .set("Cookie", authCookie)
      .send({ email: UNKNOWN_EMAIL, items: [{ description: "x", quantity: 1, unitAmountMinor: 100 }] });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CLIENT_NOT_FOUND");

    const [requestRow] = await db
      .select()
      .from(invoiceRequests)
      .where(eq(invoiceRequests.recipientEmail, UNKNOWN_EMAIL));
    expect(requestRow?.outcome).toBe("CLIENT_NOT_FOUND");
    expect(requestRow?.invoiceId).toBeNull();
  });
});
