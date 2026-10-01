import { bigserial, index, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { invoiceStatusEnum, invoices } from "./invoices";

export const invoiceEvents = pgTable(
  "invoice_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    fromStatus: invoiceStatusEnum("from_status"),
    toStatus: invoiceStatusEnum("to_status").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoice_events_invoice_id_idx").on(t.invoiceId, t.createdAt)],
);
