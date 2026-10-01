import { asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { invoiceEvents } from "@/db/schema";
import type { InvoiceStatus } from "@/types/invoice.types";

export type InvoiceEventRow = typeof invoiceEvents.$inferSelect;

export interface NewInvoiceEventInput {
  readonly invoiceId: string;
  readonly fromStatus: InvoiceStatus | null;
  readonly toStatus: InvoiceStatus;
  readonly detail?: Record<string, unknown>;
}

export async function insertInvoiceEvent(db: Database, input: NewInvoiceEventInput): Promise<void> {
  await db.insert(invoiceEvents).values(input);
}

export async function listInvoiceEvents(db: Database, invoiceId: string): Promise<InvoiceEventRow[]> {
  return db
    .select()
    .from(invoiceEvents)
    .where(eq(invoiceEvents.invoiceId, invoiceId))
    .orderBy(asc(invoiceEvents.createdAt));
}
