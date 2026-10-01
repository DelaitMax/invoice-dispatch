import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/db/migrations/**",
      "coverage/**",
      "docs/openapi.json",
      ".puppeteerrc.cjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read env only from src/config/env.ts",
        },
      ],
    },
  },
  {
    files: ["src/config/env.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.test.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Tests should set env vars via tests/setupEnv.ts, not read process.env ad hoc.",
        },
      ],
    },
  },
  {
    // Test env bootstrap is allowed to set process.env before the app loads config.
    files: ["tests/setupEnv.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },
  eslintConfigPrettier,
);
