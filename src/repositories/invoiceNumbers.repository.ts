import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { invoiceCounters } from "@/db/schema";
import { INVOICE_NUMBER_PAD_WIDTH, INVOICE_NUMBER_PREFIX } from "@/constants";

export function formatInvoiceNumber(year: number, sequence: number): string {
  return `${INVOICE_NUMBER_PREFIX}-${year}-${String(sequence).padStart(INVOICE_NUMBER_PAD_WIDTH, "0")}`;
}

export async function allocateInvoiceNumber(db: Database, year: number): Promise<string> {
  const [row] = await db
    .insert(invoiceCounters)
    .values({ year, lastNumber: 1 })
    .onConflictDoUpdate({
      target: invoiceCounters.year,
      set: { lastNumber: sql`${invoiceCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: invoiceCounters.lastNumber });

  if (!row) {
    throw new Error(`Failed to allocate an invoice number for year ${year}`);
  }

  return formatInvoiceNumber(year, row.lastNumber);
}
