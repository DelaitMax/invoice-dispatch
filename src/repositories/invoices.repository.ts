import { and, eq, inArray, lt, or, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import { invoices } from "@/db/schema";
import type { InvoiceStatus } from "@/types/invoice.types";

export type InvoiceRow = typeof invoices.$inferSelect;
type NewInvoice = typeof invoices.$inferInsert;

export type NewInvoiceInput = Pick<
  NewInvoice,
  | "invoiceNumber"
  | "clientId"
  | "companyId"
  | "recipientEmail"
  | "currency"
  | "totalMinor"
  | "billingSnapshot"
  | "notes"
  | "issuedAt"
  | "dueAt"
  | "idempotencyKey"
  | "requestHash"
>;

export async function insertInvoice(db: Database, data: NewInvoiceInput): Promise<InvoiceRow> {
  const [row] = await db.insert(invoices).values(data).returning();

  if (!row) {
    // Unreachable: an insert with RETURNING always returns the row it just created.
    throw new Error("Failed to insert invoice");
  }

  return row;
}

export async function findInvoiceById(db: Database, id: string): Promise<InvoiceRow | null> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findInvoiceByIdempotencyKey(db: Database, idempotencyKey: string): Promise<InvoiceRow | null> {
  const rows = await db.select().from(invoices).where(eq(invoices.idempotencyKey, idempotencyKey)).limit(1);
  return rows[0] ?? null;
}

/** Columns a status transition is allowed to also set in the same statement. */
export type InvoiceStatusPatch = Partial<
  Pick<NewInvoice, "pdfGeneratedAt" | "sentAt" | "failedAt" | "lastError" | "providerMessageId">
>;

export interface UpdateInvoiceStatusOptions {
  /**
   * `from` may legitimately include `to` itself, so a sequential BullMQ retry (or a
   * stalled-job reassignment) can re-enter a status it's already in — but without a guard,
   * that same rule lets two genuinely *concurrent* callers both match and both "win"
   *. When `from` includes `to`, that branch of the
   * WHERE clause additionally requires `updated_at < staleBefore`: a row updated a moment ago
   * (by the other concurrent caller) fails this check, while a row that's truly been sitting
   * untouched long enough to be "stuck" passes it. Required whenever self-transition is
   * requested — omitting it makes that branch always false, i.e. self-transition is refused
   * by default rather than silently unsafe.
   */
  readonly staleBefore?: Date;
}

/**
 * `UPDATE invoices SET status = :to, updated_at = now(), ...patch WHERE id = :id AND
 * (status = ANY(:otherStatuses) OR (status = :to AND updated_at < :staleBefore)) RETURNING
 * *`. Still one statement, still no read-modify-write at the application level (ADR-2): if
 * another worker already moved the row out of the allowed set — or holds a live, recent claim
 * on it — this matches zero rows and returns null instead of racing.
 */
export async function updateInvoiceStatus(
  db: Database,
  id: string,
  from: readonly InvoiceStatus[],
  to: InvoiceStatus,
  patch: InvoiceStatusPatch = {},
  options: UpdateInvoiceStatusOptions = {},
): Promise<InvoiceRow | null> {
  const otherStatuses = from.filter((status) => status !== to);
  const allowsSelfTransition = otherStatuses.length !== from.length;

  const branches: SQL[] = [];
  if (otherStatuses.length > 0) {
    branches.push(inArray(invoices.status, otherStatuses));
  }
  if (allowsSelfTransition) {
    // No staleBefore provided: this branch can never match (fail closed), so self-transition
    // is refused rather than silently allowed without a staleness guard.
    const staleBefore = options.staleBefore ?? new Date(0);
    branches.push(and(eq(invoices.status, to), lt(invoices.updatedAt, staleBefore))!);
  }

  const statusCondition = branches.length === 1 ? branches[0] : or(...branches);

  const [row] = await db
    .update(invoices)
    .set({ status: to, updatedAt: new Date(), ...patch })
    .where(and(eq(invoices.id, id), statusCondition))
    .returning();

  return row ?? null;
}

export interface FindStuckInvoicesOptions {
  readonly statuses: readonly InvoiceStatus[];
  readonly updatedBefore: Date;
  readonly limit: number;
}

export async function findStuckInvoices(db: Database, options: FindStuckInvoicesOptions): Promise<InvoiceRow[]> {
  return db
    .select()
    .from(invoices)
    .where(and(inArray(invoices.status, options.statuses), lt(invoices.updatedAt, options.updatedBefore)))
    .orderBy(invoices.updatedAt)
    .limit(options.limit);
}
