import { UnrecoverableError } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClaimLostError } from "@/services/claimLost.error";
import { renderAndStoreInvoicePdf, type PdfDeps } from "@/services/invoicePdf.service";
import type { Logger } from "@/utils/logger";

const { htmlToPdfMock, renderInvoiceHtmlMock } = vi.hoisted(() => ({
  htmlToPdfMock: vi.fn(),
  renderInvoiceHtmlMock: vi.fn(),
}));

vi.mock("@/pdf/htmlToPdf", () => ({ htmlToPdf: htmlToPdfMock }));
vi.mock("@/pdf/renderInvoiceHtml", () => ({ renderInvoiceHtml: renderInvoiceHtmlMock }));

const INVOICE_ID = "55555555-5555-4555-8555-555555555555";

const INVOICE = {
  id: INVOICE_ID,
  invoiceNumber: "INV-2026-000002",
  billingSnapshot: { client: { firstName: "Ada", lastName: "Lovelace" } },
  issuedAt: new Date("2026-01-01T00:00:00Z"),
  dueAt: null,
  totalMinor: 5000,
  notes: null,
};

const ITEM_ROW = { position: 1, description: "Widget", quantity: 2, unitAmountMinor: 2500, amountMinor: 5000 };
const FAKE_PDF = Buffer.from("%PDF-fake");

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => fakeLogger()) };
}

function buildDeps(overrides: Partial<PdfDeps> = {}): PdfDeps {
  return {
    db: {} as never,
    invoices: { findById: vi.fn(async () => INVOICE as never) },
    items: { list: vi.fn(async () => [ITEM_ROW] as never) },
    documents: { upsert: vi.fn(async () => undefined as never) },
    status: {
      claim: vi.fn(async () => INVOICE as never),
      transition: vi.fn(async () => INVOICE as never),
    },
    browser: {} as never,
    emailQueue: { add: vi.fn(async () => undefined as never) },
    maxBytes: 5_000_000,
    timeoutMs: 20_000,
    leaseMs: 120_000,
    logger: fakeLogger(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  htmlToPdfMock.mockResolvedValue(FAKE_PDF);
  renderInvoiceHtmlMock.mockReturnValue("<html>fake</html>");
});

describe("renderAndStoreInvoicePdf", () => {
  it("logs and returns without claiming when the invoice no longer exists", async () => {
    const deps = buildDeps({ invoices: { findById: vi.fn(async () => null as never) } });

    await renderAndStoreInvoicePdf(INVOICE_ID, deps);

    expect(deps.status.claim).not.toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith(expect.stringContaining("no longer exists"), {
      invoiceId: INVOICE_ID,
    });
  });

  it("fails the attempt (does not silently complete) when claim returns null and another executor holds the invoice", async () => {
    const deps = buildDeps({
      invoices: { findById: vi.fn(async () => ({ ...INVOICE, status: "PDF_RENDERING" }) as never) },
      status: { claim: vi.fn(async () => null), transition: vi.fn() },
    });

    await expect(renderAndStoreInvoicePdf(INVOICE_ID, deps)).rejects.toBeInstanceOf(ClaimLostError);

    expect(htmlToPdfMock).not.toHaveBeenCalled();
    expect(deps.documents.upsert).not.toHaveBeenCalled();
    expect(deps.status.transition).not.toHaveBeenCalled();
    expect(deps.emailQueue.add).not.toHaveBeenCalled();
  });

  it.each(["PDF_READY", "EMAIL_SENDING", "SENT", "FAILED"])(
    "a lost claim on an invoice that is already %s finishes without rendering",
    async (status) => {
      const deps = buildDeps({
        invoices: { findById: vi.fn(async () => ({ ...INVOICE, status }) as never) },
        status: { claim: vi.fn(async () => null), transition: vi.fn() },
      });

      await expect(renderAndStoreInvoicePdf(INVOICE_ID, deps)).resolves.toBeUndefined();

      expect(htmlToPdfMock).not.toHaveBeenCalled();
    },
  );

  it("claims from PENDING or its own in-flight PDF_RENDERING with the executor's token and the configured lease", async () => {
    const deps = buildDeps({ leaseMs: 90_000 });

    await renderAndStoreInvoicePdf(INVOICE_ID, deps, "pdf-abc");

    expect(deps.status.claim).toHaveBeenCalledWith(
      deps.db,
      deps,
      INVOICE_ID,
      ["PENDING", "PDF_RENDERING"],
      "PDF_RENDERING",
      {},
      { claimToken: "pdf-abc", leaseMs: 90_000 },
    );
  });

  it("hands the claim back (PDF_RENDERING -> PENDING) when the render fails with a retryable error", async () => {
    htmlToPdfMock.mockRejectedValue(new Error("chromium crashed"));
    const deps = buildDeps();

    await expect(renderAndStoreInvoicePdf(INVOICE_ID, deps, "pdf-abc")).rejects.toThrow("chromium crashed");

    expect(deps.status.transition).toHaveBeenCalledWith(
      deps.db,
      deps,
      INVOICE_ID,
      ["PDF_RENDERING"],
      "PENDING",
      { lastError: "chromium crashed" },
      { claimToken: "pdf-abc" },
    );
    expect(deps.emailQueue.add).not.toHaveBeenCalled();
  });

  it("renders from the invoice's items and snapshot, stores the PDF, and transitions to PDF_READY", async () => {
    const deps = buildDeps();

    await renderAndStoreInvoicePdf(INVOICE_ID, deps);

    expect(renderInvoiceHtmlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: INVOICE.billingSnapshot,
        items: [ITEM_ROW],
        invoiceNumber: INVOICE.invoiceNumber,
        totalMinor: INVOICE.totalMinor,
      }),
    );
    expect(deps.documents.upsert).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ invoiceId: INVOICE_ID, content: FAKE_PDF, contentType: "application/pdf" }),
    );
    expect(deps.status.transition).toHaveBeenCalledWith(
      deps.db,
      deps,
      INVOICE_ID,
      ["PDF_RENDERING"],
      "PDF_READY",
      expect.objectContaining({ pdfGeneratedAt: expect.any(Date) }),
      { claimToken: expect.any(String) },
    );
  });

  it("enqueues the email job with a deterministic per-invoice jobId after a successful render", async () => {
    const deps = buildDeps();

    await renderAndStoreInvoicePdf(INVOICE_ID, deps);

    expect(deps.emailQueue.add).toHaveBeenCalledWith(
      "send",
      { invoiceId: INVOICE_ID },
      { jobId: `email-${INVOICE_ID}` },
    );
  });

  it("does not let a failed (best-effort) email enqueue reject the whole render -- the sweeper is the backstop, not this call", async () => {
    const deps = buildDeps({ emailQueue: { add: vi.fn(async () => Promise.reject(new Error("redis down"))) } });

    await expect(renderAndStoreInvoicePdf(INVOICE_ID, deps)).resolves.toBeUndefined();

    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.stringContaining("sweeper will pick this invoice up"),
      expect.objectContaining({ invoiceId: INVOICE_ID }),
    );
    expect(deps.status.transition).toHaveBeenCalledWith(
      deps.db,
      deps,
      INVOICE_ID,
      ["PDF_RENDERING"],
      "PDF_READY",
      expect.anything(),
      { claimToken: expect.any(String) },
    );
  });

  it("marks FAILED and throws UnrecoverableError immediately when the rendered PDF exceeds maxBytes -- no retry can fix a fixed-size overage", async () => {
    const deps = buildDeps({ maxBytes: 4 });
    htmlToPdfMock.mockResolvedValue(Buffer.from("way too big for 4 bytes"));

    await expect(renderAndStoreInvoicePdf(INVOICE_ID, deps)).rejects.toBeInstanceOf(UnrecoverableError);

    expect(deps.status.transition).toHaveBeenCalledWith(
      deps.db,
      deps,
      INVOICE_ID,
      ["PDF_RENDERING"],
      "FAILED",
      expect.objectContaining({ lastError: expect.stringContaining("exceeding the 4-byte limit") }),
      { claimToken: expect.any(String) },
    );
    expect(deps.documents.upsert).not.toHaveBeenCalled();
    expect(deps.emailQueue.add).not.toHaveBeenCalled();
  });

  it("lets a retryable rendering failure (e.g. a Chromium crash) propagate -- after handing the claim back; whether it was the last attempt is pdf.worker.ts's decision", async () => {
    const deps = buildDeps();
    htmlToPdfMock.mockRejectedValue(new Error("Chromium crashed"));

    await expect(renderAndStoreInvoicePdf(INVOICE_ID, deps)).rejects.toThrow("Chromium crashed");

    expect(deps.status.transition).toHaveBeenCalledTimes(1);
    expect(deps.status.transition).toHaveBeenCalledWith(
      deps.db,
      deps,
      INVOICE_ID,
      ["PDF_RENDERING"],
      "PENDING",
      { lastError: "Chromium crashed" },
      { claimToken: expect.any(String) },
    );
  });
});
