import { db } from "@/db/client";
import { clients, companies } from "@/db/schema";

export const TEST_COMPANY_ID = "99999999-9999-4999-8999-999999999901";
export const TEST_CLIENT_ID = "99999999-9999-4999-8999-999999999902";
export const TEST_CLIENT_EMAIL = "integration-client@example.com";
export const TEST_CLIENT_FIRST_NAME = "Ivy";
export const TEST_CLIENT_LAST_NAME = "Tester";

export const UNKNOWN_EMAIL = "nobody-registered@example.com";

export async function seedTestFixtures(): Promise<void> {
  await db
    .insert(companies)
    .values({
      id: TEST_COMPANY_ID,
      name: "Integration Test Co",
      addressLine1: "1 Integration Avenue",
      city: "Testville",
      postalCode: "00000",
      country: "Testland",
    })
    .onConflictDoNothing({ target: companies.id });

  await db
    .insert(clients)
    .values({
      id: TEST_CLIENT_ID,
      email: TEST_CLIENT_EMAIL,
      firstName: TEST_CLIENT_FIRST_NAME,
      lastName: TEST_CLIENT_LAST_NAME,
      companyId: TEST_COMPANY_ID,
    })
    .onConflictDoNothing({ target: clients.email });
}
