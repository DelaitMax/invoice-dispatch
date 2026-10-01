import type { Database } from "@/db/client";
import { insertInvoiceEvent } from "@/repositories/invoiceEvents.repository";
import {
  type InvoiceRow,
  type InvoiceStatusPatch,
  type UpdateInvoiceStatusOptions,
  findInvoiceById,
  updateInvoiceStatus,
} from "@/repositories/invoices.repository";
import type { InvoiceStatus } from "@/types/invoice.types";
import { AppError } from "@/utils/AppError";
import type { Logger } from "@/utils/logger";

export interface TransitionDeps {
  readonly logger: Logger;
}

export interface StatusService {
  readonly claim: typeof claim;
  readonly transition: typeof transition;
}

/**
 *
 *
 * When `from` includes `to` (a legitimate sequential retry re-entering its own in-flight
 * status), pass `options.staleBefore` — see updateInvoiceStatus's doc comment for why that
 * guard is required to keep a *self*-transition from also admitting a truly concurrent
 * duplicate claim.
 *
 */
export async function claim(
  db: Database,
  deps: TransitionDeps,
  invoiceId: string,
  from: readonly InvoiceStatus[],
  to: InvoiceStatus,
  patch: InvoiceStatusPatch = {},
  options: UpdateInvoiceStatusOptions = {},
): Promise<InvoiceRow | null> {
  return db.transaction(async (tx) => {
    const updated = await updateInvoiceStatus(tx, invoiceId, from, to, patch, options);

    if (!updated) {
      const current = await findInvoiceById(tx, invoiceId);
      deps.logger.warn("Invoice status transition rejected", {
        invoiceId,
        expected: from,
        actual: current?.status ?? "unknown (invoice not found)",
        target: to,
      });
      return null;
    }

    await insertInvoiceEvent(tx, {
      invoiceId,
      fromStatus: from.length === 1 ? (from[0] ?? null) : null,
      toStatus: to,
      ...(patch.lastError ? { detail: { lastError: patch.lastError } } : {}),
    });

    deps.logger.debug("Invoice status transition", { invoiceId, from, to });

    return updated;
  });
}

export async function transition(
  db: Database,
  deps: TransitionDeps,
  invoiceId: string,
  from: readonly InvoiceStatus[],
  to: InvoiceStatus,
  patch: InvoiceStatusPatch = {},
): Promise<InvoiceRow> {
  const updated = await claim(db, deps, invoiceId, from, to, patch);

  if (!updated) {
    throw AppError.conflict(
      `Invoice ${invoiceId} is not in an expected status for this transition (expected one of: ${from.join(", ")}, target: ${to})`,
      "INVOICE_STATUS_CONFLICT",
    );
  }

  return updated;
}
