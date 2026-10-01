import type { Database } from "@/db/client";
import { insertInvoiceEvent } from "@/repositories/invoiceEvents.repository";
import { type InvoiceRow, type InvoiceStatusPatch, updateInvoiceStatus } from "@/repositories/invoices.repository";
import type { InvoiceStatus } from "@/types/invoice.types";
import { AppError } from "@/utils/AppError";
import type { Logger } from "@/utils/logger";

export interface TransitionDeps {
  readonly logger: Logger;
}

/**
 * The only function in the codebase that changes invoices.status (ADR-2). Underneath it's one
 * conditional `UPDATE ... WHERE id = :id AND status = ANY(:from) RETURNING *` — no
 * read-modify-write at the application level, so two workers racing to move the same invoice
 * can never both "win". Losing that race isn't a bug: it means someone else already made the
 * transition, so this throws a 409 instead of silently overwriting it.
 *
 */
export async function transition(
  db: Database,
  deps: TransitionDeps,
  invoiceId: string,
  from: readonly InvoiceStatus[],
  to: InvoiceStatus,
  patch: InvoiceStatusPatch = {},
): Promise<InvoiceRow> {
  return db.transaction(async (tx) => {
    const updated = await updateInvoiceStatus(tx, invoiceId, from, to, patch);

    if (!updated) {
      throw AppError.conflict(
        `Invoice ${invoiceId} is not in an expected status for this transition (expected one of: ${from.join(", ")}, target: ${to})`,
        "INVOICE_STATUS_CONFLICT",
      );
    }

    await insertInvoiceEvent(tx, {
      invoiceId,
      fromStatus: from.length === 1 ? (from[0] ?? null) : null,
      toStatus: to,
      ...(patch.lastError ? { detail: { lastError: patch.lastError } } : {}),
    });

    deps.logger.info("Invoice status transition", { invoiceId, from, to });

    return updated;
  });
}
