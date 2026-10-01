import { UnrecoverableError } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { sendInvoiceEmail, type EmailDeps } from "@/services/invoiceEmail.service";
import type { Logger } from "@/utils/logger";

const INVOICE_ID = "44444444-4444-4444-8444-444444444444";

const INVOICE = {
  id: INVOICE_ID,
  invoiceNumber: "INV-2026-000001",
  currency: "USD",
  totalMinor: 5000,
  recipientEmail: "client@example.com",
  dueAt: null,
  billingSnapshot: { client: { firstName: "Ada", lastName: "Lovelace" } },
};

const DOCUMENT = { content: Buffer.from("%PDF-fake"), contentType: "application/pdf" };

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => fakeLogger()) };
}

function buildDeps(overrides: Partial<EmailDeps> = {}): EmailDeps {
  return {
    db: {} as never,
    invoices: { findById: vi.fn(async () => INVOICE as never) },
    documents: { findByInvoiceId: vi.fn(async () => DOCUMENT as never) },
    status: {
      claim: vi.fn(async () => INVOICE as never),
      transition: vi.fn(async () => INVOICE as never),
    },
    mailer: { send: vi.fn(async () => ({ messageId: "msg-1" })) },
    sender: {
      brand: "Test Brand",
      name: "Test Sender",
      email: "sender@example.com",
      phone: undefined,
      address: { line1: "1 St", line2: undefined, city: "City", postalCode: undefined, country: undefined },
    },
    staleAfterMs: 120_000,
    logger: fakeLogger(),
    ...overrides,
  };
}

describe("sendInvoiceEmail", () => {
  it("never calls mailer.send when claim returns null (lost the race to another attempt)", async () => {
    const deps = buildDeps({ status: { claim: vi.fn(async () => null), transition: vi.fn() } });

    await sendInvoiceEmail(INVOICE_ID, false, deps);

    expect(deps.mailer.send).not.toHaveBeenCalled();
    expect(deps.status.transition).not.toHaveBeenCalled();
  });

  it("sends the mail and transitions to SENT on success", async () => {
    const deps = buildDeps();

    await sendInvoiceEmail(INVOICE_ID, false, deps);

    expect(deps.mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: INVOICE.recipientEmail,
        attachment: expect.objectContaining({ filename: "INV-2026-000001.pdf" }),
      }),
    );
    expect(deps.status.transition).toHaveBeenCalledWith(
      deps.db,
      deps,
      INVOICE_ID,
      ["EMAIL_SENDING"],
      "SENT",
      expect.objectContaining({ providerMessageId: "msg-1" }),
    );
  });

  it("throws UnrecoverableError and marks FAILED immediately on a permanent mail error, even on a non-final attempt", async () => {
    const permanentError = Object.assign(new Error("bad address"), { status: 400 });
    const deps = buildDeps({ mailer: { send: vi.fn(async () => Promise.reject(permanentError)) } });

    await expect(sendInvoiceEmail(INVOICE_ID, false, deps)).rejects.toBeInstanceOf(UnrecoverableError);

    expect(deps.status.transition).toHaveBeenCalledWith(
      deps.db,
      deps,
      INVOICE_ID,
      ["EMAIL_SENDING"],
      "FAILED",
      expect.objectContaining({ lastError: expect.stringContaining("bad address") }),
    );
  });

  it("does NOT mark FAILED for a temporary error on a non-final attempt (status must not flicker before retries are exhausted)", async () => {
    const temporaryError = Object.assign(new Error("timeout"), { status: 500 });
    const deps = buildDeps({ mailer: { send: vi.fn(async () => Promise.reject(temporaryError)) } });

    await expect(sendInvoiceEmail(INVOICE_ID, false, deps)).rejects.toThrow("timeout");

    expect(deps.status.transition).not.toHaveBeenCalled();
  });

  it("marks FAILED for a temporary error once it is the final attempt", async () => {
    const temporaryError = Object.assign(new Error("timeout"), { status: 500 });
    const deps = buildDeps({ mailer: { send: vi.fn(async () => Promise.reject(temporaryError)) } });

    await expect(sendInvoiceEmail(INVOICE_ID, true, deps)).rejects.toThrow("timeout");

    expect(deps.status.transition).toHaveBeenCalledWith(
      deps.db,
      deps,
      INVOICE_ID,
      ["EMAIL_SENDING"],
      "FAILED",
      expect.objectContaining({ lastError: expect.stringContaining("timeout") }),
    );
  });
});
