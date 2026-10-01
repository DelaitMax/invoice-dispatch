import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@tests": path.resolve(__dirname, "tests"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setupEnv.ts"],
    // Integration tests hit a real, shared Postgres/Redis — a single worker keeps test files
    // from racing each other's truncate/seed calls against that shared state. This is a test
    // hygiene measure, not a substitute for correct concurrency handling in the app itself
    // (see updateInvoiceStatus's staleBefore guard for that).
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/worker.ts",
        "src/db/migrate.ts",
        "src/db/seed.ts",
        "src/db/exportSql.ts",
        "src/db/schema/**",
        "src/db/client.ts",
        "src/docs/export.ts",
        "src/types/**",
      ],
    },
  },
});
