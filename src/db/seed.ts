import "dotenv/config";
import { env } from "@/config/env";
import { findUserByEmail, insertUser } from "@/repositories/users.repository";
import { hashPassword } from "@/utils/password";
import { db, closeDb } from "./client";
import { clients, companies } from "./schema";
import { logger } from "@/utils/logger";

const COMPANY_ACME_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_GLOBEX_ID = "22222222-2222-4222-8222-222222222222";
const COMPANY_INITECH_ID = "33333333-3333-4333-8333-333333333333";

const SEED_COMPANIES = [
  {
    id: COMPANY_ACME_ID,
    name: "Acme Inc.",
    addressLine1: "123 Market Street",
    city: "San Francisco",
    postalCode: "94105",
    country: "United States",
    taxId: "EIN-12-3456789",
  },
  {
    id: COMPANY_GLOBEX_ID,
    name: "Globex Corporation",
    addressLine1: "45 Sprawl Avenue",
    city: "Springfield",
    postalCode: "62704",
    country: "United States",
    taxId: "EIN-98-7654321",
  },
  {
    id: COMPANY_INITECH_ID,
    name: "Initech LLC",
    addressLine1: "4120 Freidrich Lane",
    city: "Austin",
    postalCode: "78744",
    country: "United States",
    taxId: "EIN-45-6789012",
  },
];

const SEED_CLIENTS = [
  { email: "john.doe@acme.example", firstName: "John", lastName: "Doe", companyId: COMPANY_ACME_ID },
  { email: "jane.smith@acme.example", firstName: "Jane", lastName: "Smith", companyId: COMPANY_ACME_ID },
  { email: "hank.scorpio@globex.example", firstName: "Hank", lastName: "Scorpio", companyId: COMPANY_GLOBEX_ID },
  { email: "peter.gibbons@initech.example", firstName: "Peter", lastName: "Gibbons", companyId: COMPANY_INITECH_ID },
  { email: "mia.wallace@example.com", firstName: "Mia", lastName: "Wallace", companyId: null },
];

async function main(): Promise<void> {
  await db.insert(companies).values(SEED_COMPANIES).onConflictDoNothing({ target: companies.id });
  await db.insert(clients).values(SEED_CLIENTS).onConflictDoNothing({ target: clients.email });

  logger.info("Seed complete", { companies: SEED_COMPANIES.length, clients: SEED_CLIENTS.length });

  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const existing = await findUserByEmail(db, env.ADMIN_EMAIL);
    if (existing) {
      logger.info("Admin bootstrap skipped: user already exists", { email: env.ADMIN_EMAIL });
    } else {
      const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
      await insertUser(db, { email: env.ADMIN_EMAIL, passwordHash, role: "admin" });
      logger.info("Admin bootstrap complete", { email: env.ADMIN_EMAIL });
    }
  }
}

main()
  .catch((err: unknown) => {
    logger.error("Seed failed", {
      error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: err },
    });
    process.exitCode = 1;
  })
  .finally(() => closeDb());
