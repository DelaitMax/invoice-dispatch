import { UnrecoverableError } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { ClaimLostError } from "@/services/claimLost.error";
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
    leaseMs: 120_000,
    logger: fakeLogger(),
    ...overrides,
  };
}

describe("sendInvoiceEmail", () => {
  it("never calls mailer.send when claim returns null, and fails the attempt instead of silently completing the job", async () => {
    const inFlight = { ...INVOICE, status: "EMAIL_SENDING" };
    const deps = buildDeps({
      invoices: { findById: vi.fn(async () => inFlight as never) },
      status: { claim: vi.fn(async () => null), transition: vi.fn() },
    });

    await expect(sendInvoiceEmail(INVOICE_ID, false, deps)).rejects.toBeInstanceOf(ClaimLostError);

    expect(deps.mailer.send).not.toHaveBeenCalled();
    expect(deps.status.transition).not.toHaveBeenCalled();
  });

  it.each(["SENT", "FAILED"])(
    "a lost claim on an invoice that is already %s finishes without sending",
    async (status) => {
      const deps = buildDeps({
        invoices: { findById: vi.fn(async () => ({ ...INVOICE, status }) as never) },
        status: { claim: vi.fn(async () => null), transition: vi.fn() },
      });

      await expect(sendInvoiceEmail(INVOICE_ID, false, deps)).resolves.toBeUndefined();

      expect(deps.mailer.send).not.toHaveBeenCalled();
    },
  );

  it("claims with the executor's token and the configured lease", async () => {
    const deps = buildDeps({ leaseMs: 90_000 });

    await sendInvoiceEmail(INVOICE_ID, false, deps, "email-abc");

    expect(deps.status.claim).toHaveBeenCalledWith(
      deps.db,
      deps,
      INVOICE_ID,
      ["PDF_READY", "EMAIL_SENDING"],
      "EMAIL_SENDING",
      {},
      { claimToken: "email-abc", leaseMs: 90_000 },
    );
  });

  it("does not retry the send when the mail went out but recording SENT failed", async () => {
    const deps = buildDeps();
    vi.mocked(deps.status.transition).mockRejectedValueOnce(new Error("db down"));

    await expect(sendInvoiceEmail(INVOICE_ID, false, deps)).rejects.toBeInstanceOf(UnrecoverableError);

    expect(deps.mailer.send).toHaveBeenCalledTimes(1);
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.stringContaining("SENT could not be recorded"),
      expect.objectContaining({ providerMessageId: "msg-1" }),
    );
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
      { claimToken: expect.any(String) },
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
      { claimToken: expect.any(String) },
    );
  });

  it("does NOT mark FAILED for a temporary error on a non-final attempt — it hands the claim back to PDF_READY", async () => {
    const temporaryError = Object.assign(new Error("timeout"), { status: 500 });
    const deps = buildDeps({ mailer: { send: vi.fn(async () => Promise.reject(temporaryError)) } });

    await expect(sendInvoiceEmail(INVOICE_ID, false, deps)).rejects.toThrow("timeout");

    expect(deps.status.transition).toHaveBeenCalledTimes(1);
    expect(deps.status.transition).toHaveBeenCalledWith(
      deps.db,
      deps,
      INVOICE_ID,
      ["EMAIL_SENDING"],
      "PDF_READY",
      { lastError: "timeout" },
      { claimToken: expect.any(String) },
    );
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
      { claimToken: expect.any(String) },
    );
  });

  it("escapes HTML-significant characters in the client's first name before building the email HTML (client data, not markup)", async () => {
    const maliciousInvoice = {
      ...INVOICE,
      billingSnapshot: { client: { firstName: "<script>alert(1)</script>", lastName: "Lovelace" } },
    };
    const deps = buildDeps({ invoices: { findById: vi.fn(async () => maliciousInvoice as never) } });

    await sendInvoiceEmail(INVOICE_ID, false, deps);

    const sentMail = vi.mocked(deps.mailer.send).mock.calls[0]?.[0];
    expect(sentMail?.html).not.toContain("<script>");
    expect(sentMail?.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
