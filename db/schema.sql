-- GENERATED FILE. Do not edit by hand.
-- Source of truth: src/db/schema/*.ts. Regenerate with `pnpm db:export-sql` after
-- `pnpm db:generate` (ADR-3).

-- drizzle-kit doesn't manage Postgres extensions; citext backs clients.email and
-- invoices.recipient_email (case-insensitive, see src/db/schema/customTypes.ts).
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE "public"."invoice_status" AS ENUM('PENDING', 'PDF_RENDERING', 'PDF_READY', 'EMAIL_SENDING', 'SENT', 'FAILED');

CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text,
	"postal_code" text,
	"country" text,
	"tax_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_email_unique" UNIQUE("email")
);

CREATE TABLE "invoice_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_number" bigint DEFAULT 0 NOT NULL
);

CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"client_id" uuid NOT NULL,
	"company_id" uuid,
	"recipient_email" "citext" NOT NULL,
	"currency" char(3) NOT NULL,
	"total_minor" bigint NOT NULL,
	"status" "invoice_status" DEFAULT 'PENDING' NOT NULL,
	"billing_snapshot" jsonb NOT NULL,
	"notes" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"pdf_generated_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error" text,
	"provider_message_id" text,
	"idempotency_key" text,
	"request_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "invoices_total_minor_check" CHECK ("invoices"."total_minor" >= 0)
);

CREATE TABLE "invoice_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount_minor" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "invoice_items_quantity_check" CHECK ("invoice_items"."quantity" > 0),
	CONSTRAINT "invoice_items_unit_amount_minor_check" CHECK ("invoice_items"."unit_amount_minor" >= 0),
	CONSTRAINT "invoice_items_amount_minor_check" CHECK ("invoice_items"."amount_minor" >= 0),
	CONSTRAINT "invoice_items_amount_consistent" CHECK ("invoice_items"."amount_minor" = "invoice_items"."quantity" * "invoice_items"."unit_amount_minor")
);

CREATE TABLE "invoice_documents" (
	"invoice_id" uuid PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL,
	"content_type" text DEFAULT 'application/pdf' NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_documents_byte_size_check" CHECK ("invoice_documents"."byte_size" > 0)
);

CREATE TABLE "invoice_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"invoice_id" uuid,
	"recipient_email" text NOT NULL,
	"raw_body" jsonb NOT NULL,
	"idempotency_key" text,
	"client_ip" "inet",
	"user_agent" text,
	"request_id" text,
	"outcome" text DEFAULT 'RECEIVED' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "invoice_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"from_status" "invoice_status",
	"to_status" "invoice_status" NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "invoice_events" ADD CONSTRAINT "invoice_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "invoices_idempotency_key_key" ON "invoices" USING btree ("idempotency_key") WHERE "invoices"."idempotency_key" is not null;

CREATE INDEX "invoices_status_created_at_idx" ON "invoices" USING btree ("status","created_at");

CREATE INDEX "invoices_recipient_email_idx" ON "invoices" USING btree ("recipient_email");

CREATE UNIQUE INDEX "invoice_items_position_key" ON "invoice_items" USING btree ("invoice_id","position");

CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items" USING btree ("invoice_id");

CREATE INDEX "invoice_requests_received_at_idx" ON "invoice_requests" USING btree ("received_at" DESC NULLS LAST);

CREATE INDEX "invoice_requests_invoice_id_idx" ON "invoice_requests" USING btree ("invoice_id");

CREATE INDEX "invoice_events_invoice_id_idx" ON "invoice_events" USING btree ("invoice_id","created_at");
