import { bigint, integer, pgTable } from "drizzle-orm/pg-core";

export const invoiceCounters = pgTable("invoice_counters", {
  year: integer("year").primaryKey(),
  lastNumber: bigint("last_number", { mode: "number" }).notNull().default(0),
});
