import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/app";
import { closeDb, db } from "@/db/client";
import { invoiceRequests, invoices } from "@/db/schema";
import { listInvoiceEvents } from "@/repositories/invoiceEvents.repository";
import { seedTestFixtures, TEST_CLIENT_EMAIL } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";
import { loginAsAdmin, loginAsUser } from "./helpers/auth";
import { createReadyInvoice, setStatus } from "./helpers/invoices";

vi.mock("@/queue/pdfQueue", () => ({
  pdfQueue: { add: vi.fn(async () => ({}) as never) },
}));

const app = createApp();
let ownerCookie: string;
let strangerCookie: string;
let adminCookie: string;

beforeAll(async () => {
  await seedTestFixtures();
  ownerCookie = await loginAsUser(app);
  strangerCookie = await loginAsUser(app);
  adminCookie = await loginAsAdmin(app);
});

beforeEach(async () => {
  await truncateInvoiceTables();
});

afterAll(async () => {
  await closeDb();
});

async function createAs(cookie: string): Promise<string> {
  const created = await request(app)
    .post("/api/invoices")
    .set("Cookie", cookie)
    .send({ email: TEST_CLIENT_EMAIL, items: [{ description: "Owned work", quantity: 1, unitAmountMinor: 1000 }] });
  expect(created.status).toBe(202);
  return created.body.invoiceId as string;
}

async function userIdOf(cookie: string): Promise<string> {
  const me = await request(app).get("/auth/me").set("Cookie", cookie);
  return me.body.id as string;
}

describe("access to an invoice: owner or admin, nobody else", () => {
  it("the owner can read it", async () => {
    const id = await createAs(ownerCookie);
    const response = await request(app).get(`/api/invoices/${id}`).set("Cookie", ownerCookie);
    expect(response.status).toBe(200);
  });

  it("another account gets the same 404 as for an id that does not exist — for the invoice and for its PDF", async () => {
    const id = await createAs(ownerCookie);

    const missing = await request(app)
      .get("/api/invoices/00000000-0000-4000-8000-000000000000")
      .set("Cookie", strangerCookie);
    const details = await request(app).get(`/api/invoices/${id}`).set("Cookie", strangerCookie);
    const pdf = await request(app).get(`/api/invoices/${id}/pdf`).set("Cookie", strangerCookie);

    expect(details.status).toBe(404);
    expect(pdf.status).toBe(404);
    expect(details.body.error.code).toBe("INVOICE_NOT_FOUND");
    expect(pdf.body.error.code).toBe("INVOICE_NOT_FOUND");
    expect(missing.status).toBe(details.status);
    expect(missing.body.error.code).toBe(details.body.error.code);
  });

  it("an admin can read any invoice", async () => {
    const id = await createAs(ownerCookie);
    const response = await request(app).get(`/api/invoices/${id}`).set("Cookie", adminCookie);
    expect(response.status).toBe(200);
  });

  it("an invoice with no recorded owner (predates attribution) is admin-only", async () => {
    const legacyId = await createReadyInvoice();

    const asUser = await request(app).get(`/api/invoices/${legacyId}`).set("Cookie", ownerCookie);
    const asAdmin = await request(app).get(`/api/invoices/${legacyId}`).set("Cookie", adminCookie);

    expect(asUser.status).toBe(404);
    expect(asAdmin.status).toBe(200);
  });

  it("an unauthenticated request is still 401", async () => {
    const id = await createAs(ownerCookie);
    expect((await request(app).get(`/api/invoices/${id}`)).status).toBe(401);
    expect((await request(app).get(`/api/invoices/${id}/pdf`)).status).toBe(401);
  });
});

describe("attribution: whose account did this?", () => {
  it("records the creator on the invoice, on the audit row and on the first event", async () => {
    const ownerId = await userIdOf(ownerCookie);
    const id = await createAs(ownerCookie);

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    expect(invoice?.createdBy).toBe(ownerId);

    const [audit] = await db.select().from(invoiceRequests).where(eq(invoiceRequests.invoiceId, id));
    expect(audit?.userId).toBe(ownerId);

    const events = await listInvoiceEvents(db, id);
    expect(events[0]).toMatchObject({ toStatus: "PENDING", userId: ownerId });
  });

  it("records the audit row even for a request that created nothing (unknown client)", async () => {
    const ownerId = await userIdOf(ownerCookie);

    const response = await request(app)
      .post("/api/invoices")
      .set("Cookie", ownerCookie)
      .send({ email: "nobody-registered@example.com", items: [{ description: "x", quantity: 1, unitAmountMinor: 1 }] });
    expect(response.status).toBe(404);

    const rows = await db.select().from(invoiceRequests).where(eq(invoiceRequests.outcome, "CLIENT_NOT_FOUND"));
    expect(rows.at(-1)?.userId).toBe(ownerId);
  });

  it("records who pressed retry on the status event (and leaves worker transitions user-less)", async () => {
    const adminId = await userIdOf(adminCookie);
    const id = await createReadyInvoice();
    await setStatus(id, "FAILED");

    const retry = await request(app).post(`/api/invoices/${id}/retry`).set("Cookie", adminCookie);
    expect(retry.status).toBe(202);

    const events = await listInvoiceEvents(db, id);
    expect(events.at(-1)).toMatchObject({ toStatus: "PENDING", userId: adminId });
    expect(events[0]?.userId).toBeNull();
  });
});
