import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { senderProfile } from "@/config/sender";
import { closeDb, db } from "@/db/client";
import type { Mailer, OutgoingMail, SendResult } from "@/mail/mailer";
import { findInvoiceDocument, upsertInvoiceDocument } from "@/repositories/invoiceDocuments.repository";
import { insertInvoiceEvent } from "@/repositories/invoiceEvents.repository";
import { insertInvoiceItems } from "@/repositories/invoiceItems.repository";
import { allocateInvoiceNumber } from "@/repositories/invoiceNumbers.repository";
import { findInvoiceById, insertInvoice } from "@/repositories/invoices.repository";
import { sendInvoiceEmail, type EmailDeps } from "@/services/invoiceEmail.service";
import { claim, transition } from "@/services/invoiceStatus.service";
import { logger } from "@/utils/logger";
import { seedTestFixtures, TEST_CLIENT_ID, TEST_CLIENT_EMAIL, TEST_COMPANY_ID } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";

beforeAll(async () => {
  await seedTestFixtures();
});

beforeEach(async () => {
  await truncateInvoiceTables();
});

afterAll(async () => {
  await closeDb();
});

async function createReadyInvoice(): Promise<string> {
  const invoiceNumber = await allocateInvoiceNumber(db, 2026);
  const invoice = await insertInvoice(db, {
    invoiceNumber,
    clientId: TEST_CLIENT_ID,
    companyId: TEST_COMPANY_ID,
    recipientEmail: TEST_CLIENT_EMAIL,
    currency: "USD",
    totalMinor: 5000,
    billingSnapshot: {
      client: { firstName: "Ivy", lastName: "Tester", email: TEST_CLIENT_EMAIL, company: null },
      sender: {
        brand: senderProfile.brand,
        name: senderProfile.name,
        email: senderProfile.email,
        phone: senderProfile.phone ?? null,
        address: {
          line1: senderProfile.address.line1,
          line2: senderProfile.address.line2 ?? null,
          city: senderProfile.address.city,
          postalCode: senderProfile.address.postalCode ?? null,
          country: senderProfile.address.country ?? null,
        },
      },
      currency: "USD",
      issuedAt: new Date().toISOString(),
    },
    notes: null,
    issuedAt: new Date(),
    dueAt: null,
    idempotencyKey: null,
    requestHash: null,
  });
  await insertInvoiceItems(db, invoice.id, [
    { position: 1, description: "Duplicate-job test", quantity: 1, unitAmountMinor: 5000, amountMinor: 5000 },
  ]);
  await insertInvoiceEvent(db, { invoiceId: invoice.id, fromStatus: null, toStatus: "PENDING" });
  await transition(db, { logger }, invoice.id, ["PENDING"], "PDF_RENDERING");
  await upsertInvoiceDocument(db, {
    invoiceId: invoice.id,
    content: Buffer.from("%PDF-fake"),
    contentType: "application/pdf",
    byteSize: 9,
    sha256: "abc",
  });
  await transition(db, { logger }, invoice.id, ["PDF_RENDERING"], "PDF_READY", { pdfGeneratedAt: new Date() });

  return invoice.id;
}

describe("pipeline.duplicate — the key test of this project", () => {
  it("running the same email job twice concurrently calls mailer.send exactly once", async () => {
    const invoiceId = await createReadyInvoice();

    const sentMails: OutgoingMail[] = [];
    const fakeMailer: Mailer = {
      send: vi.fn(async (mail: OutgoingMail): Promise<SendResult> => {
        sentMails.push(mail);
        return { messageId: "fake-msg-1" };
      }),
    };

    const deps: EmailDeps = {
      db,
      invoices: { findById: findInvoiceById },
      documents: { findByInvoiceId: findInvoiceDocument },
      status: { claim, transition },
      mailer: fakeMailer,
      sender: senderProfile,
      staleAfterMs: 120_000,
      logger,
    };

    // Two "workers" processing the exact same job for the exact same invoice at the same
    // time — the scenario a duplicate BullMQ delivery or a sweeper race would produce.
    await Promise.all([sendInvoiceEmail(invoiceId, false, deps), sendInvoiceEmail(invoiceId, false, deps)]);

    expect(fakeMailer.send).toHaveBeenCalledTimes(1);
    expect(sentMails).toHaveLength(1);

    const finalInvoice = await findInvoiceById(db, invoiceId);
    expect(finalInvoice?.status).toBe("SENT");
  });

  it("also holds when the second call starts slightly after the first has already sent", async () => {
    const invoiceId = await createReadyInvoice();

    const sentMails: OutgoingMail[] = [];
    const fakeMailer: Mailer = {
      send: vi.fn(async (mail: OutgoingMail): Promise<SendResult> => {
        sentMails.push(mail);
        return { messageId: "fake-msg-2" };
      }),
    };

    const deps: EmailDeps = {
      db,
      invoices: { findById: findInvoiceById },
      documents: { findByInvoiceId: findInvoiceDocument },
      status: { claim, transition },
      mailer: fakeMailer,
      sender: senderProfile,
      staleAfterMs: 120_000,
      logger,
    };

    await sendInvoiceEmail(invoiceId, false, deps);
    await sendInvoiceEmail(invoiceId, false, deps);

    expect(fakeMailer.send).toHaveBeenCalledTimes(1);
  });
});
