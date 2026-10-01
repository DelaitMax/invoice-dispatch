import { and, eq, inArray, lt } from "drizzle-orm";
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

/**
 * `UPDATE invoices SET status = :to, updated_at = now(), ...patch WHERE id = :id AND status =
 * ANY(:from) RETURNING *`. The single statement this whole service is built around
 * (ADR-2): if another worker already moved the row out of `from`, this matches zero rows
 * and returns null instead of racing a read-then-write.
 */
export async function updateInvoiceStatus(
  db: Database,
  id: string,
  from: readonly InvoiceStatus[],
  to: InvoiceStatus,
  patch: InvoiceStatusPatch = {},
): Promise<InvoiceRow | null> {
  const [row] = await db
    .update(invoices)
    .set({ status: to, updatedAt: new Date(), ...patch })
    .where(and(eq(invoices.id, id), inArray(invoices.status, from)))
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
