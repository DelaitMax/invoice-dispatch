import { UnrecoverableError, type Queue } from "bullmq";
import type { Database } from "@/db/client";
import type { BrowserHandle } from "@/pdf/browser";
import { htmlToPdf } from "@/pdf/htmlToPdf";
import { renderInvoiceHtml } from "@/pdf/renderInvoiceHtml";
import type { findInvoiceById } from "@/repositories/invoices.repository";
import type { upsertInvoiceDocument } from "@/repositories/invoiceDocuments.repository";
import type { listInvoiceItems } from "@/repositories/invoiceItems.repository";
import type { StatusService } from "@/services/invoiceStatus.service";
import type { InvoiceItemView } from "@/types/invoice.types";
import type { EmailJobData } from "@/types/queue.types";
import { sha256Hex } from "@/utils/hash";
import type { Logger } from "@/utils/logger";

export interface InvoicesRepository {
  readonly findById: typeof findInvoiceById;
}

export interface InvoiceItemsRepository {
  readonly list: typeof listInvoiceItems;
}

export interface InvoiceDocumentsRepository {
  readonly upsert: typeof upsertInvoiceDocument;
}

export interface PdfDeps {
  readonly db: Database;
  readonly invoices: InvoicesRepository;
  readonly items: InvoiceItemsRepository;
  readonly documents: InvoiceDocumentsRepository;
  readonly status: StatusService;
  readonly browser: BrowserHandle;
  readonly emailQueue: Pick<Queue<EmailJobData>, "add">;
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly logger: Logger;
}

function toItemView(row: {
  position: number;
  description: string;
  quantity: number;
  unitAmountMinor: number;
  amountMinor: number;
}): InvoiceItemView {
  return {
    position: row.position,
    description: row.description,
    quantity: row.quantity,
    unitAmountMinor: row.unitAmountMinor,
    amountMinor: row.amountMinor,
  };
}

/**
 * Retryable failures (a Chromium crash, a render timeout) are left to throw naturally —
 * BullMQ's own attempts/backoff handles those, and the worker (pdf.worker.ts) is the one that
 * knows whether an attempt was the last one and flips the invoice to FAILED. An oversized PDF
 * is different: retrying can never fix it, so it's handled here, immediately, as a permanent
 * failure.
 */
export async function renderAndStoreInvoicePdf(invoiceId: string, deps: PdfDeps): Promise<void> {
  const invoice = await deps.invoices.findById(deps.db, invoiceId);

  if (!invoice) {
    deps.logger.error("PDF render job for an invoice that no longer exists", { invoiceId });
    return;
  }

  // PDF_RENDERING is a valid source for itself: a BullMQ retry or a sweeper re-pickup runs
  // this function again on an invoice a previous attempt already moved out of PENDING before
  // failing partway through. staleBefore gates that self-transition on
  // staleness (see updateInvoiceStatus) so a truly concurrent duplicate claim — not just a
  // legitimate retry — can never also succeed: this render attempt can't still be genuinely
  // in flight past its own timeoutMs.
  const claimed = await deps.status.claim(
    deps.db,
    deps,
    invoiceId,
    ["PENDING", "PDF_RENDERING"],
    "PDF_RENDERING",
    {},
    { staleBefore: new Date(Date.now() - deps.timeoutMs) },
  );

  if (!claimed) {
    deps.logger.warn("Skipping PDF render: could not claim the invoice (already claimed or moved on)", {
      invoiceId,
    });
    return;
  }

  const itemRows = await deps.items.list(deps.db, invoiceId);
  const html = renderInvoiceHtml({
    snapshot: invoice.billingSnapshot,
    items: itemRows.map(toItemView),
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    totalMinor: invoice.totalMinor,
    notes: invoice.notes,
  });

  const pdf = await htmlToPdf(html, { browser: deps.browser, timeoutMs: deps.timeoutMs });

  if (pdf.byteLength > deps.maxBytes) {
    const lastError = `Rendered PDF is ${pdf.byteLength} bytes, exceeding the ${deps.maxBytes}-byte limit`;
    await deps.status.transition(deps.db, deps, invoiceId, ["PDF_RENDERING"], "FAILED", { lastError });
    throw new UnrecoverableError(lastError);
  }

  await deps.documents.upsert(deps.db, {
    invoiceId,
    content: pdf,
    contentType: "application/pdf",
    byteSize: pdf.byteLength,
    sha256: sha256Hex(pdf),
  });

  await deps.status.transition(deps.db, deps, invoiceId, ["PDF_RENDERING"], "PDF_READY", {
    pdfGeneratedAt: new Date(),
  });

  try {
    await deps.emailQueue.add("send", { invoiceId }, { jobId: `email-${invoiceId}` });
  } catch (err) {
    deps.logger.error("Failed to enqueue email job; the sweeper will pick this invoice up", {
      invoiceId,
      error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: err },
    });
  }
}
