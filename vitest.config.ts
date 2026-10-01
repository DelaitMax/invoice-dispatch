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
