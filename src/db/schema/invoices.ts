import {
  bigint,
  char,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { citext } from "./customTypes";
import { clients } from "./clients";
import { companies } from "./companies";
import { INVOICE_STATUSES, type BillingSnapshot } from "@/types/invoice.types";

export const invoiceStatusEnum = pgEnum("invoice_status", INVOICE_STATUSES);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceNumber: text("invoice_number").notNull().unique(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    recipientEmail: citext("recipient_email").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    status: invoiceStatusEnum("status").notNull().default("PENDING"),
    billingSnapshot: jsonb("billing_snapshot").$type<BillingSnapshot>().notNull(),
    notes: text("notes"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    pdfGeneratedAt: timestamp("pdf_generated_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    claimToken: text("claim_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_idempotency_key_key")
      .on(t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("invoices_status_created_at_idx").on(t.status, t.createdAt),
    index("invoices_recipient_email_idx").on(t.recipientEmail),
    index("invoices_lease_until_idx")
      .on(t.leaseUntil)
      .where(sql`${t.leaseUntil} is not null`),
    check("invoices_total_minor_check", sql`${t.totalMinor} >= 0`),
  ],
);
