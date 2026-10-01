import { UnrecoverableError } from "bullmq";
import type { SenderProfile } from "@/config/sender";
import type { Database } from "@/db/client";
import type { findInvoiceDocument } from "@/repositories/invoiceDocuments.repository";
import type { findInvoiceById } from "@/repositories/invoices.repository";
import type { StatusService } from "@/services/invoiceStatus.service";
import { formatDisplayDate } from "@/utils/date";
import type { Logger } from "@/utils/logger";
import { formatMinor } from "@/utils/money";
import { isPermanentMailError } from "@/mail/errors";
import type { Mailer } from "@/mail/mailer";
import { escapeHtml } from "@/utils/escapeHtml";

export interface InvoicesRepository {
  readonly findById: typeof findInvoiceById;
}

export interface InvoiceDocumentsRepository {
  readonly findByInvoiceId: typeof findInvoiceDocument;
}

export interface EmailDeps {
  readonly db: Database;
  readonly invoices: InvoicesRepository;
  readonly documents: InvoiceDocumentsRepository;
  readonly status: StatusService;
  readonly mailer: Mailer;
  readonly sender: SenderProfile;
  /** How long an EMAIL_SENDING claim may sit before it's considered stale enough to
   * re-claim — see updateInvoiceStatus's doc comment
   * for why this guard is what keeps a legitimate retry from also admitting a truly
   * concurrent duplicate. */
  readonly staleAfterMs: number;
  readonly logger: Logger;
}

function buildEmailBody(
  invoice: { invoiceNumber: string; currency: string; totalMinor: number; dueAt: Date | null },
  recipientFirstName: string,
  sender: SenderProfile,
): { subject: string; text: string; html: string } {
  const amount = formatMinor(invoice.totalMinor, invoice.currency);
  const dueLine = invoice.dueAt ? `Payment is due by ${formatDisplayDate(invoice.dueAt)}.` : "";
  const subject = `Invoice ${invoice.invoiceNumber} from ${sender.brand}`;

  const text = [
    `Hi ${recipientFirstName},`,
    "",
    `Please find attached invoice ${invoice.invoiceNumber} for ${amount}.`,
    dueLine,
    "",
    `Thank you for your business,`,
    sender.name,
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  const html = `<p>Hi ${escapeHtml(recipientFirstName)},</p>
<p>Please find attached invoice <strong>${invoice.invoiceNumber}</strong> for <strong>${amount}</strong>.</p>
${dueLine ? `<p>${dueLine}</p>` : ""}
<p>Thank you for your business,<br />${sender.name}</p>`;

  return { subject, text, html };
}

export async function sendInvoiceEmail(invoiceId: string, isFinalAttempt: boolean, deps: EmailDeps): Promise<void> {
  const invoice = await deps.invoices.findById(deps.db, invoiceId);

  if (!invoice) {
    deps.logger.error("Email job for an invoice that no longer exists", { invoiceId });
    return;
  }

  // PDF_READY is the normal source; EMAIL_SENDING is a retry or sweeper re-pickup landing on
  // an invoice a previous attempt already moved out of PDF_READY (same reasoning as the PDF
  // worker's self-transition — see invoicePdf.service.ts). staleBefore gates that
  // self-transition on staleness: this is exactly the "same email job ran twice
  // concurrently" case — without the guard, both concurrent callers would
  // match and both send; with it, only a claim older than staleAfterMs can be re-claimed, so
  // the second, still-live concurrent call loses the race and returns without ever calling
  // the mailer.
  const claimed = await deps.status.claim(
    deps.db,
    deps,
    invoiceId,
    ["PDF_READY", "EMAIL_SENDING"],
    "EMAIL_SENDING",
    {},
    { staleBefore: new Date(Date.now() - deps.staleAfterMs) },
  );

  if (!claimed) {
    deps.logger.warn("Skipping email send: could not claim the invoice (already claimed or moved on)", {
      invoiceId,
    });
    return;
  }

  const document = await deps.documents.findByInvoiceId(deps.db, invoiceId);

  if (!document) {
    const lastError = `No stored PDF document found for invoice ${invoiceId}`;
    await deps.status.transition(deps.db, deps, invoiceId, ["EMAIL_SENDING"], "FAILED", { lastError });
    throw new UnrecoverableError(lastError);
  }

  const { subject, text, html } = buildEmailBody(invoice, invoice.billingSnapshot.client.firstName, deps.sender);

  try {
    const result = await deps.mailer.send({
      to: invoice.recipientEmail,
      subject,
      text,
      html,
      attachment: {
        filename: `${invoice.invoiceNumber}.pdf`,
        content: document.content,
        contentType: "application/pdf",
      },
      tags: ["invoice"],
      variables: { "invoice-id": invoiceId },
    });

    await deps.status.transition(deps.db, deps, invoiceId, ["EMAIL_SENDING"], "SENT", {
      sentAt: new Date(),
      providerMessageId: result.messageId,
    });
  } catch (err) {
    const permanent = isPermanentMailError(err);

    // A permanent error (bad address, suppression list, ...) never gets better on retry — it
    // ends the invoice's journey right away, regardless of attempts remaining. A temporary
    // error only ends it once BullMQ has genuinely exhausted its retries.
    if (permanent || isFinalAttempt) {
      const lastError = err instanceof Error ? err.message : String(err);
      await deps.status
        .transition(deps.db, deps, invoiceId, ["EMAIL_SENDING"], "FAILED", { lastError })
        .catch((transitionErr: unknown) => {
          deps.logger.error("Failed to mark invoice FAILED after an email send error", {
            invoiceId,
            error: transitionErr instanceof Error ? transitionErr.message : String(transitionErr),
          });
        });
    }

    if (permanent) {
      throw new UnrecoverableError(err instanceof Error ? err.message : String(err));
    }

    throw err;
  }
}
