import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { companies } from "@/db/schema";

export interface CompanyRow {
  readonly id: string;
  readonly name: string;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
  readonly taxId: string | null;
}

export async function findCompanyById(db: Database, id: string): Promise<CompanyRow | null> {
  const rows = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return rows[0] ?? null;
}
