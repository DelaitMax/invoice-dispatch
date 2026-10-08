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

export interface ClaimOptions extends UpdateInvoiceStatusOptions {
  readonly actorUserId?: string;
}

export interface StatusService {
  readonly claim: typeof claim;
  readonly transition: typeof transition;
}

export async function claim(
  db: Database,
  deps: TransitionDeps,
  invoiceId: string,
  from: readonly InvoiceStatus[],
  to: InvoiceStatus,
  patch: InvoiceStatusPatch = {},
  options: ClaimOptions = {},
): Promise<InvoiceRow | null> {
  const { actorUserId, ...updateOptions } = options;

  return db.transaction(async (tx) => {
    const updated = await updateInvoiceStatus(tx, invoiceId, from, to, patch, updateOptions);

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
      ...(actorUserId ? { userId: actorUserId } : {}),
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
  options: ClaimOptions = {},
): Promise<InvoiceRow> {
  const updated = await claim(db, deps, invoiceId, from, to, patch, options);

  if (!updated) {
    throw AppError.conflict(
      `Invoice ${invoiceId} is not in an expected status for this transition (expected one of: ${from.join(", ")}, target: ${to})`,
      "INVOICE_STATUS_CONFLICT",
    );
  }

  return updated;
}
