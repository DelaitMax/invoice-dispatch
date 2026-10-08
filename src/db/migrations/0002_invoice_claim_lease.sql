ALTER TABLE "invoices" ADD COLUMN "claim_token" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "invoices_lease_until_idx" ON "invoices" USING btree ("lease_until") WHERE "invoices"."lease_until" is not null;
--> statement-breakpoint
UPDATE "invoices" SET "lease_until" = "updated_at" + interval '120 seconds' WHERE "status" IN ('PDF_RENDERING', 'EMAIL_SENDING') AND "lease_until" IS NULL;
