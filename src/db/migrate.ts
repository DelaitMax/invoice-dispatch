import "dotenv/config";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

const MIGRATIONS_FOLDER = join(__dirname, "migrations");

async function main(): Promise<void> {
  const migrationClient = postgres(env.DATABASE_URL, { max: 1 });

  try {
    const migrationDb = drizzle(migrationClient);
    logger.info("Running database migrations", { folder: MIGRATIONS_FOLDER });
    await migrate(migrationDb, { migrationsFolder: MIGRATIONS_FOLDER });
    logger.info("Database migrations complete");
  } finally {
    await migrationClient.end();
  }
}

main().catch((err: unknown) => {
  logger.error("Database migration failed", {
    error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: err },
  });
  process.exitCode = 1;
});
