import "dotenv/config";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@/utils/logger";

const MIGRATIONS_DIR = join(__dirname, "migrations");
const OUTPUT_DIR = join(__dirname, "..", "..", "db");
const OUTPUT_FILE = join(OUTPUT_DIR, "schema.sql");
const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

const HEADER = `-- GENERATED FILE. Do not edit by hand.
-- Source of truth: src/db/schema/*.ts. Regenerate with \`pnpm db:export-sql\` after
-- \`pnpm db:generate\` (ADR-3).

`;

function main(): void {
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const statements = migrationFiles
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), "utf8"))
    .join("\n")
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, `${HEADER}${statements.join("\n\n")}\n`, "utf8");

  logger.info("Exported combined schema SQL", { outputFile: OUTPUT_FILE, migrations: migrationFiles.length });
}

main();
