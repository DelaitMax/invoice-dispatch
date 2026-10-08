import { randomUUID } from "node:crypto";
import { UnrecoverableError, type Queue } from "bullmq";
import type { Database } from "@/db/client";
import type { BrowserHandle } from "@/pdf/browser";
import { htmlToPdf } from "@/pdf/htmlToPdf";
import { renderInvoiceHtml } from "@/pdf/renderInvoiceHtml";
import type { InvoiceRow, findInvoiceById } from "@/repositories/invoices.repository";
import type { upsertInvoiceDocument } from "@/repositories/invoiceDocuments.repository";
import type { listInvoiceItems } from "@/repositories/invoiceItems.repository";
import type { StatusService } from "@/services/invoiceStatus.service";
import type { InvoiceItemView } from "@/types/invoice.types";
import type { EmailJobData } from "@/types/queue.types";
import { sha256Hex } from "@/utils/hash";
import type { Logger } from "@/utils/logger";
import { ClaimLostError } from "./claimLost.error";

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
  readonly leaseMs: number;
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

async function handleLostClaim(invoiceId: string, deps: PdfDeps): Promise<void> {
  const current = await deps.invoices.findById(deps.db, invoiceId);

  if (current && (current.status === "PDF_READY" || current.status === "EMAIL_SENDING" || current.status === "SENT")) {
    deps.logger.info("PDF job found the invoice already rendered; nothing to do", {
      invoiceId,
      status: current.status,
    });
    return;
  }

  if (current?.status === "FAILED") {
    deps.logger.warn("PDF job found the invoice FAILED; not rendering (retry it explicitly if wanted)", {
      invoiceId,
      lastError: current.lastError,
    });
    return;
  }

  deps.logger.warn("PDF job could not claim the invoice; failing the attempt so it is retried", {
    invoiceId,
    status: current?.status ?? "missing",
    leaseUntil: current?.leaseUntil ?? null,
  });
  throw new ClaimLostError(invoiceId, "pdf", current?.status);
}

export async function renderAndStoreInvoicePdf(
  invoiceId: string,
  deps: PdfDeps,
  claimToken: string = randomUUID(),
): Promise<void> {
  const invoice = await deps.invoices.findById(deps.db, invoiceId);

  if (!invoice) {
    deps.logger.error("PDF render job for an invoice that no longer exists", { invoiceId });
    return;
  }

  const lease = { claimToken, leaseMs: deps.leaseMs };

  const claimed = await deps.status.claim(
    deps.db,
    deps,
    invoiceId,
    ["PENDING", "PDF_RENDERING"],
    "PDF_RENDERING",
    {},
    lease,
  );

  if (!claimed) {
    await handleLostClaim(invoiceId, deps);
    return;
  }

  try {
    await renderAndStore(invoice, deps, claimToken);
  } catch (err) {
    if (!(err instanceof UnrecoverableError)) {
      await deps.status
        .transition(
          deps.db,
          deps,
          invoiceId,
          ["PDF_RENDERING"],
          "PENDING",
          { lastError: err instanceof Error ? err.message : String(err) },
          { claimToken },
        )
        .catch((transitionErr: unknown) => {
          deps.logger.error("Failed to release the PDF claim after a render error", {
            invoiceId,
            error: transitionErr instanceof Error ? transitionErr.message : String(transitionErr),
          });
        });
    }
    throw err;
  }

  try {
    await deps.emailQueue.add("send", { invoiceId }, { jobId: `email-${invoiceId}` });
  } catch (err) {
    deps.logger.error("Failed to enqueue email job; the sweeper will pick this invoice up", {
      invoiceId,
      error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: err },
    });
  }
}

async function renderAndStore(invoice: InvoiceRow, deps: PdfDeps, claimToken: string): Promise<void> {
  const invoiceId = invoice.id;
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
    await deps.status.transition(deps.db, deps, invoiceId, ["PDF_RENDERING"], "FAILED", { lastError }, { claimToken });
    throw new UnrecoverableError(lastError);
  }

  await deps.documents.upsert(deps.db, {
    invoiceId,
    content: pdf,
    contentType: "application/pdf",
    byteSize: pdf.byteLength,
    sha256: sha256Hex(pdf),
  });

  await deps.status.transition(
    deps.db,
    deps,
    invoiceId,
    ["PDF_RENDERING"],
    "PDF_READY",
    { pdfGeneratedAt: new Date(), lastError: null },
    { claimToken },
  );
}
