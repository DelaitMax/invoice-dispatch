import { asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { invoiceItems } from "@/db/schema";

export type InvoiceItemRow = typeof invoiceItems.$inferSelect;
type NewInvoiceItem = typeof invoiceItems.$inferInsert;

export type NewInvoiceItemInput = Pick<
  NewInvoiceItem,
  "position" | "description" | "quantity" | "unitAmountMinor" | "amountMinor"
>;

export async function insertInvoiceItems(
  db: Database,
  invoiceId: string,
  items: readonly NewInvoiceItemInput[],
): Promise<InvoiceItemRow[]> {
  return db
    .insert(invoiceItems)
    .values(items.map((item) => ({ ...item, invoiceId })))
    .returning();
}

export async function listInvoiceItems(db: Database, invoiceId: string): Promise<InvoiceItemRow[]> {
  return db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceItems.position));
}
