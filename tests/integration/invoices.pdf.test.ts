import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/app";
import { closeDb, db } from "@/db/client";
import { upsertInvoiceDocument } from "@/repositories/invoiceDocuments.repository";
import { seedTestFixtures, TEST_CLIENT_EMAIL } from "./fixtures";
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

describe("GET /api/invoices/:id/pdf", () => {
  it("returns 409 PDF_NOT_READY before the document has been rendered", async () => {
    const created = await request(app)
      .post("/api/invoices")
      .send({ email: TEST_CLIENT_EMAIL, items: [{ description: "x", quantity: 1, unitAmountMinor: 100 }] });

    const response = await request(app).get(`/api/invoices/${created.body.invoiceId}/pdf`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PDF_NOT_READY");
  });

  it("returns 200 application/pdf with the stored bytes once the document exists", async () => {
    const created = await request(app)
      .post("/api/invoices")
      .send({ email: TEST_CLIENT_EMAIL, items: [{ description: "x", quantity: 1, unitAmountMinor: 100 }] });

    const fakePdf = Buffer.from("%PDF-1.4 fake content for the integration test");
    await upsertInvoiceDocument(db, {
      invoiceId: created.body.invoiceId,
      content: fakePdf,
      contentType: "application/pdf",
      byteSize: fakePdf.byteLength,
      sha256: "deadbeef",
    });

    const response = await request(app).get(`/api/invoices/${created.body.invoiceId}/pdf`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toContain(`${created.body.invoiceNumber}.pdf`);
    expect(Buffer.compare(response.body, fakePdf)).toBe(0);
  });

  it("returns 404 for an unknown invoice id", async () => {
    const response = await request(app).get("/api/invoices/00000000-0000-4000-8000-000000000000/pdf");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("INVOICE_NOT_FOUND");
  });
});
