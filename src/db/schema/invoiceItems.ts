import { bigint, bigserial, check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { invoices } from "./invoices";

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitAmountMinor: bigint("unit_amount_minor", { mode: "number" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("invoice_items_position_key").on(t.invoiceId, t.position),
    index("invoice_items_invoice_id_idx").on(t.invoiceId),
    check("invoice_items_quantity_check", sql`${t.quantity} > 0`),
    check("invoice_items_unit_amount_minor_check", sql`${t.unitAmountMinor} >= 0`),
    check("invoice_items_amount_minor_check", sql`${t.amountMinor} >= 0`),
    check("invoice_items_amount_consistent", sql`${t.amountMinor} = ${t.quantity} * ${t.unitAmountMinor}`),
  ],
);
