import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { invoiceRequests } from "@/db/schema";

export type InvoiceRequestRow = typeof invoiceRequests.$inferSelect;
type NewInvoiceRequest = typeof invoiceRequests.$inferInsert;

export type NewInvoiceRequestInput = Pick<
  NewInvoiceRequest,
  "recipientEmail" | "rawBody" | "idempotencyKey" | "clientIp" | "userAgent" | "requestId" | "userId"
>;

export async function insertInvoiceRequest(db: Database, data: NewInvoiceRequestInput): Promise<InvoiceRequestRow> {
  const [row] = await db.insert(invoiceRequests).values(data).returning();

  if (!row) {
    throw new Error("Failed to insert invoice request audit row");
  }

  return row;
}

export async function updateInvoiceRequestOutcome(
  db: Database,
  id: number,
  outcome: string,
  invoiceId: string | null = null,
): Promise<void> {
  await db.update(invoiceRequests).set({ outcome, invoiceId }).where(eq(invoiceRequests.id, id));
}
