import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@/utils/logger";
import { buildDocument } from "./openapi";

const OUTPUT_DIR = join(__dirname, "..", "..", "docs");
const OUTPUT_PATH = join(OUTPUT_DIR, "openapi.json");

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(buildDocument(), null, 2)}\n`);
  logger.info("Exported OpenAPI document", { outputPath: OUTPUT_PATH });
}

main();
