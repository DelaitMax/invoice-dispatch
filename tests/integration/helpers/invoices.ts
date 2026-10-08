import { eq, sql } from "drizzle-orm";
import { vi } from "vitest";
import { senderProfile } from "@/config/sender";
import { db } from "@/db/client";
import { invoices } from "@/db/schema";
import type { Mailer, OutgoingMail, SendResult } from "@/mail/mailer";
import { findInvoiceDocument, upsertInvoiceDocument } from "@/repositories/invoiceDocuments.repository";
import { insertInvoiceEvent } from "@/repositories/invoiceEvents.repository";
import { insertInvoiceItems } from "@/repositories/invoiceItems.repository";
import { allocateInvoiceNumber } from "@/repositories/invoiceNumbers.repository";
import { findInvoiceById, insertInvoice } from "@/repositories/invoices.repository";
import type { EmailDeps } from "@/services/invoiceEmail.service";
import { claim, transition } from "@/services/invoiceStatus.service";
import type { InvoiceStatus } from "@/types/invoice.types";
import { logger } from "@/utils/logger";
import { TEST_CLIENT_EMAIL, TEST_CLIENT_ID, TEST_COMPANY_ID } from "../fixtures";

export async function createReadyInvoice(): Promise<string> {
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
    { position: 1, description: "Test item", quantity: 1, unitAmountMinor: 5000, amountMinor: 5000 },
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

export async function startSendingAs(invoiceId: string, claimToken: string, leaseMs = 120_000): Promise<void> {
  const claimed = await claim(db, { logger }, invoiceId, ["PDF_READY"], "EMAIL_SENDING", {}, { claimToken, leaseMs });
  if (!claimed) {
    throw new Error(`test setup: could not put ${invoiceId} into EMAIL_SENDING`);
  }
}

export async function expireLease(invoiceId: string): Promise<void> {
  await db
    .update(invoices)
    .set({ leaseUntil: sql`now() - interval '1 second'` })
    .where(eq(invoices.id, invoiceId));
}

export async function getInvoice(invoiceId: string) {
  const invoice = await findInvoiceById(db, invoiceId);
  if (!invoice) {
    throw new Error(`invoice ${invoiceId} not found`);
  }
  return invoice;
}

export async function setStatus(invoiceId: string, status: InvoiceStatus): Promise<void> {
  await db.update(invoices).set({ status }).where(eq(invoices.id, invoiceId));
}

export interface FakeMailer extends Mailer {
  readonly sent: OutgoingMail[];
}

export function createFakeMailer(failures: ReadonlyArray<Error> = []): FakeMailer {
  const remaining = [...failures];
  const sent: OutgoingMail[] = [];
  return {
    sent,
    send: vi.fn(async (mail: OutgoingMail): Promise<SendResult> => {
      const failure = remaining.shift();
      if (failure) {
        throw failure;
      }
      sent.push(mail);
      return { messageId: `fake-msg-${sent.length}` };
    }),
  };
}

export function buildEmailDeps(mailer: Mailer, overrides: Partial<EmailDeps> = {}): EmailDeps {
  return {
    db,
    invoices: { findById: findInvoiceById },
    documents: { findByInvoiceId: findInvoiceDocument },
    status: { claim, transition },
    mailer,
    sender: senderProfile,
    leaseMs: 120_000,
    logger,
    ...overrides,
  };
}
