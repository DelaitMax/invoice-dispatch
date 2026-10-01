import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { invoiceDocuments } from "@/db/schema";

export type InvoiceDocumentRow = typeof invoiceDocuments.$inferSelect;

export interface UpsertInvoiceDocumentInput {
  readonly invoiceId: string;
  readonly content: Buffer;
  readonly contentType: string;
  readonly byteSize: number;
  readonly sha256: string;
}

export async function upsertInvoiceDocument(db: Database, input: UpsertInvoiceDocumentInput): Promise<void> {
  await db
    .insert(invoiceDocuments)
    .values(input)
    .onConflictDoUpdate({
      target: invoiceDocuments.invoiceId,
      set: {
        content: input.content,
        contentType: input.contentType,
        byteSize: input.byteSize,
        sha256: input.sha256,
        updatedAt: new Date(),
      },
    });
}

export async function findInvoiceDocument(db: Database, invoiceId: string): Promise<InvoiceDocumentRow | null> {
  const rows = await db.select().from(invoiceDocuments).where(eq(invoiceDocuments.invoiceId, invoiceId)).limit(1);
  return rows[0] ?? null;
}
