import { bigserial, index, inet, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { invoices } from "./invoices";

export const invoiceRequests = pgTable(
  "invoice_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    recipientEmail: text("recipient_email").notNull(),
    rawBody: jsonb("raw_body").$type<unknown>().notNull(),
    idempotencyKey: text("idempotency_key"),
    clientIp: inet("client_ip"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    outcome: text("outcome").notNull().default("RECEIVED"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invoice_requests_received_at_idx").on(t.receivedAt.desc()),
    index("invoice_requests_invoice_id_idx").on(t.invoiceId),
  ],
);
