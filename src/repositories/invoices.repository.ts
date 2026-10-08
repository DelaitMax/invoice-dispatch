import { and, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import { invoices } from "@/db/schema";
import { IN_FLIGHT_STATUSES, isInFlightStatus, type InvoiceStatus } from "@/types/invoice.types";

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
  readonly claimToken?: string;
  readonly leaseMs?: number;
  readonly requireExpiredLease?: boolean;
}

export async function updateInvoiceStatus(
  db: Database,
  id: string,
  from: readonly InvoiceStatus[],
  to: InvoiceStatus,
  patch: InvoiceStatusPatch = {},
  options: UpdateInvoiceStatusOptions = {},
): Promise<InvoiceRow | null> {
  const { claimToken, leaseMs, requireExpiredLease } = options;

  const leaseExpired = sql`${invoices.leaseUntil} is not null and ${invoices.leaseUntil} < now()`;
  const leaseAvailable = claimToken
    ? sql`(${invoices.claimToken} = ${claimToken} or ${invoices.leaseUntil} is null or ${invoices.leaseUntil} < now())`
    : undefined;

  const branches: SQL[] = [];
  for (const source of from) {
    const statusMatches = eq(invoices.status, source);

    if (!isInFlightStatus(source)) {
      branches.push(statusMatches);
    } else if (leaseAvailable) {
      branches.push(and(statusMatches, leaseAvailable)!);
    } else if (source !== to) {
      branches.push(requireExpiredLease ? and(statusMatches, leaseExpired)! : statusMatches);
    }
  }

  if (branches.length === 0) {
    return null;
  }

  const grantsLease = isInFlightStatus(to) && claimToken !== undefined && leaseMs !== undefined;
  const leaseColumns = grantsLease
    ? { claimToken, leaseUntil: sql`now() + (${leaseMs}::int * interval '1 millisecond')` }
    : { claimToken: null, leaseUntil: null };

  const [row] = await db
    .update(invoices)
    .set({ status: to, updatedAt: new Date(), ...patch, ...leaseColumns })
    .where(and(eq(invoices.id, id), branches.length === 1 ? branches[0] : or(...branches)))
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

export interface FindExpiredLeasesOptions {
  readonly limit: number;
}

export async function findExpiredLeases(db: Database, options: FindExpiredLeasesOptions): Promise<InvoiceRow[]> {
  return db
    .select()
    .from(invoices)
    .where(
      and(
        inArray(invoices.status, IN_FLIGHT_STATUSES),
        sql`${invoices.leaseUntil} is not null`,
        sql`${invoices.leaseUntil} < now()`,
      ),
    )
    .orderBy(invoices.leaseUntil)
    .limit(options.limit);
}
