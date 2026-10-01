import { sql } from "drizzle-orm";
import { db } from "@/db/client";

const REQUEST_LIFECYCLE_TABLES = [
  "invoice_events",
  "invoice_requests",
  "invoice_documents",
  "invoice_items",
  "invoices",
  "invoice_counters",
] as const;

export async function truncateInvoiceTables(): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE TABLE ${REQUEST_LIFECYCLE_TABLES.join(", ")} RESTART IDENTITY CASCADE`));
}
