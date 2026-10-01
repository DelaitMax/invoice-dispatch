import { UnrecoverableError } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("does nothing further when claim returns null (lost the race to another attempt)", async () => {
    const deps = buildDeps({ status: { claim: vi.fn(async () => null), transition: vi.fn() } });

    await renderAndStoreInvoicePdf(INVOICE_ID, deps);

    expect(htmlToPdfMock).not.toHaveBeenCalled();
    expect(deps.documents.upsert).not.toHaveBeenCalled();
    expect(deps.status.transition).not.toHaveBeenCalled();
    expect(deps.emailQueue.add).not.toHaveBeenCalled();
  });

  it("claims from PENDING or a stale PDF_RENDERING, into PDF_RENDERING, with staleBefore derived from timeoutMs", async () => {
    const deps = buildDeps({ timeoutMs: 20_000 });
    const before = Date.now();

    await renderAndStoreInvoicePdf(INVOICE_ID, deps);

    expect(deps.status.claim).toHaveBeenCalledWith(
      deps.db,
      deps,
      INVOICE_ID,
      ["PENDING", "PDF_RENDERING"],
      "PDF_RENDERING",
      {},
      { staleBefore: expect.any(Date) },
    );
    const [, , , , , , options] = vi.mocked(deps.status.claim).mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      { staleBefore: Date },
    ];
    // staleBefore must be ~timeoutMs in the past, not in the future and not "just now" --
    // otherwise a render that is genuinely still in flight could be claimed a second time.
    const age = before - options.staleBefore.getTime();
    expect(age).toBeGreaterThanOrEqual(20_000);
    expect(age).toBeLessThan(20_000 + 5_000);
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
    );
    expect(deps.documents.upsert).not.toHaveBeenCalled();
    expect(deps.emailQueue.add).not.toHaveBeenCalled();
  });

  it("lets a retryable rendering failure (e.g. a Chromium crash) propagate untouched -- BullMQ's attempts/backoff and pdf.worker.ts own that decision, not this function", async () => {
    const deps = buildDeps();
    htmlToPdfMock.mockRejectedValue(new Error("Chromium crashed"));

    await expect(renderAndStoreInvoicePdf(INVOICE_ID, deps)).rejects.toThrow("Chromium crashed");

    expect(deps.status.transition).not.toHaveBeenCalled();
  });
});
