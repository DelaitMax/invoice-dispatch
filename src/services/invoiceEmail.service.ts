import { randomUUID } from "node:crypto";
import { UnrecoverableError } from "bullmq";
import type { SenderProfile } from "@/config/sender";
import type { Database } from "@/db/client";
import type { findInvoiceDocument } from "@/repositories/invoiceDocuments.repository";
import type { findInvoiceById } from "@/repositories/invoices.repository";
import type { StatusService } from "@/services/invoiceStatus.service";
import { formatDisplayDate } from "@/utils/date";
import type { Logger } from "@/utils/logger";
import { formatMinor } from "@/utils/money";
import { classifyMailError, MailConfigurationError } from "@/mail/errors";
import type { Mailer } from "@/mail/mailer";
import { escapeHtml } from "@/utils/escapeHtml";
import { ClaimLostError } from "./claimLost.error";

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
  readonly leaseMs: number;
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

async function handleLostClaim(invoiceId: string, deps: EmailDeps): Promise<void> {
  const current = await deps.invoices.findById(deps.db, invoiceId);

  if (current?.status === "SENT") {
    deps.logger.info("Email job found the invoice already SENT; nothing to do", { invoiceId });
    return;
  }

  if (current?.status === "FAILED") {
    deps.logger.warn("Email job found the invoice FAILED; not sending (retry it explicitly if wanted)", {
      invoiceId,
      lastError: current.lastError,
    });
    return;
  }

  deps.logger.warn("Email job could not claim the invoice; failing the attempt so it is retried", {
    invoiceId,
    status: current?.status ?? "missing",
    leaseUntil: current?.leaseUntil ?? null,
  });
  throw new ClaimLostError(invoiceId, "email", current?.status);
}

export async function sendInvoiceEmail(
  invoiceId: string,
  isFinalAttempt: boolean,
  deps: EmailDeps,
  claimToken: string = randomUUID(),
): Promise<void> {
  const invoice = await deps.invoices.findById(deps.db, invoiceId);

  if (!invoice) {
    deps.logger.error("Email job for an invoice that no longer exists", { invoiceId });
    return;
  }

  const lease = { claimToken, leaseMs: deps.leaseMs };

  const claimed = await deps.status.claim(
    deps.db,
    deps,
    invoiceId,
    ["PDF_READY", "EMAIL_SENDING"],
    "EMAIL_SENDING",
    {},
    lease,
  );

  if (!claimed) {
    await handleLostClaim(invoiceId, deps);
    return;
  }

  const document = await deps.documents.findByInvoiceId(deps.db, invoiceId);

  if (!document) {
    const lastError = `No stored PDF document found for invoice ${invoiceId}`;
    await deps.status.transition(deps.db, deps, invoiceId, ["EMAIL_SENDING"], "FAILED", { lastError }, { claimToken });
    throw new UnrecoverableError(lastError);
  }

  const { subject, text, html } = buildEmailBody(invoice, invoice.billingSnapshot.client.firstName, deps.sender);

  let messageId: string;
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
    messageId = result.messageId;
  } catch (err) {
    await handleSendFailure(invoiceId, err, isFinalAttempt, deps, claimToken);
    return;
  }

  try {
    await deps.status.transition(
      deps.db,
      deps,
      invoiceId,
      ["EMAIL_SENDING"],
      "SENT",
      { sentAt: new Date(), providerMessageId: messageId, lastError: null },
      { claimToken },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.logger.error("Email was sent but SENT could not be recorded; not retrying to avoid a duplicate", {
      invoiceId,
      providerMessageId: messageId,
      error: message,
    });
    throw new UnrecoverableError(
      `Email for invoice ${invoiceId} was sent (provider id ${messageId}) but recording SENT failed: ${message}`,
    );
  }
}

async function handleSendFailure(
  invoiceId: string,
  err: unknown,
  isFinalAttempt: boolean,
  deps: EmailDeps,
  claimToken: string,
): Promise<never> {
  const kind = classifyMailError(err);
  const detail = err instanceof Error ? err.message : String(err);
  const httpStatus = typeof err === "object" && err !== null && "status" in err ? Number(err.status) : undefined;

  const target = kind === "permanent" || (kind === "temporary" && isFinalAttempt) ? "FAILED" : "PDF_READY";
  const lastError =
    kind === "configuration"
      ? `Email provider configuration problem (HTTP ${httpStatus ?? "?"}); sending is paused and will resume once it is fixed`
      : detail;

  await deps.status
    .transition(deps.db, deps, invoiceId, ["EMAIL_SENDING"], target, { lastError }, { claimToken })
    .catch((transitionErr: unknown) => {
      deps.logger.error(`Failed to move invoice to ${target} after an email send error`, {
        invoiceId,
        error: transitionErr instanceof Error ? transitionErr.message : String(transitionErr),
      });
    });

  if (kind === "permanent") {
    throw new UnrecoverableError(detail);
  }
  if (kind === "configuration") {
    throw new MailConfigurationError(httpStatus, detail);
  }

  throw err;
}
