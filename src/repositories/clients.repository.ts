import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { clients, companies } from "@/db/schema";

export interface ClientCompany {
  readonly id: string;
  readonly name: string;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
  readonly taxId: string | null;
}

export interface ClientWithCompany {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly company: ClientCompany | null;
}

export async function findClientByEmailWithCompany(db: Database, email: string): Promise<ClientWithCompany | null> {
  const rows = await db
    .select({
      id: clients.id,
      email: clients.email,
      firstName: clients.firstName,
      lastName: clients.lastName,
      company: {
        id: companies.id,
        name: companies.name,
        addressLine1: companies.addressLine1,
        addressLine2: companies.addressLine2,
        city: companies.city,
        postalCode: companies.postalCode,
        country: companies.country,
        taxId: companies.taxId,
      },
    })
    .from(clients)
    .leftJoin(companies, eq(clients.companyId, companies.id))
    .where(eq(clients.email, email))
    .limit(1);

  const row = rows[0];
  return row ? { ...row, company: row.company } : null;
}
