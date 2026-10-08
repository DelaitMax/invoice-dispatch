ALTER TABLE "invoices" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_events" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_requests" ADD CONSTRAINT "invoice_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_events" ADD CONSTRAINT "invoice_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_created_by_idx" ON "invoices" USING btree ("created_by");