import { check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bytea } from "./customTypes";
import { invoices } from "./invoices";

export const invoiceDocuments = pgTable(
  "invoice_documents",
  {
    invoiceId: uuid("invoice_id")
      .primaryKey()
      .references(() => invoices.id, { onDelete: "cascade" }),
    content: bytea("content").notNull(),
    contentType: text("content_type").notNull().default("application/pdf"),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("invoice_documents_byte_size_check", sql`${t.byteSize} > 0`)],
);
