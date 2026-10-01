import { z } from "zod";
import { ALLOWED_CURRENCIES } from "@/constants";

function booleanString(defaultValue: "true" | "false") {
  return z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(["true", "false"]))
    .default(defaultValue)
    .transform((v) => v === "true");
}

const optionalBooleanString = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(["true", "false"]))
  .optional();

const commonEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required").url("DATABASE_URL must be a valid connection string"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  REDIS_URL: z.string().min(1, "REDIS_URL is required").url("REDIS_URL must be a valid connection string"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  LOG_PRETTY: booleanString("false"),

  API_KEY: z.string().min(1).optional(),
  DOCS_ENABLED: optionalBooleanString,

  MAIL_FROM_NAME: z.string().min(1, "MAIL_FROM_NAME is required"),
  MAIL_FROM_EMAIL: z.string().trim().toLowerCase().email("MAIL_FROM_EMAIL must be a valid email address"),

  SENDER_BRAND: z.string().min(1, "SENDER_BRAND is required"),
  SENDER_NAME: z.string().min(1, "SENDER_NAME is required"),
  SENDER_ADDRESS_LINE1: z.string().min(1, "SENDER_ADDRESS_LINE1 is required"),
  SENDER_ADDRESS_LINE2: z.string().min(1).optional(),
  SENDER_CITY: z.string().min(1, "SENDER_CITY is required"),
  SENDER_POSTAL_CODE: z.string().min(1).optional(),
  SENDER_COUNTRY: z.string().min(1).optional(),
  SENDER_EMAIL: z.string().trim().toLowerCase().email("SENDER_EMAIL must be a valid email address"),
  SENDER_PHONE: z.string().min(1).optional(),

  INVOICE_CURRENCY_DEFAULT: z.string().trim().toUpperCase().pipe(z.enum(ALLOWED_CURRENCIES)).default("USD"),
  INVOICE_DUE_DAYS: z.coerce.number().int().nonnegative().default(14),

  PDF_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  PDF_MAX_BYTES: z.coerce.number().int().positive().default(5_242_880),
  PUPPETEER_EXECUTABLE_PATH: z.string().min(1).optional(),

  QUEUE_PDF_CONCURRENCY: z.coerce.number().int().positive().default(2),
  QUEUE_EMAIL_CONCURRENCY: z.coerce.number().int().positive().default(5),
  QUEUE_JOB_ATTEMPTS: z.coerce.number().int().positive().default(3),
  QUEUE_BACKOFF_DELAY_MS: z.coerce.number().int().positive().default(3_000),
  QUEUE_STUCK_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  QUEUE_STUCK_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  EMAIL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(50),
  EMAIL_RATE_LIMIT_DURATION_MS: z.coerce.number().int().positive().default(60_000),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
});

const mailgunDriverSchema = z.object({
  MAIL_DRIVER: z.literal("mailgun"),
  MAILGUN_API_KEY: z.string().min(1, "MAILGUN_API_KEY is required when MAIL_DRIVER=mailgun"),
  MAILGUN_DOMAIN: z.string().min(1, "MAILGUN_DOMAIN is required when MAIL_DRIVER=mailgun"),
  MAILGUN_BASE_URL: z.string().url().default("https://api.mailgun.net"),
});

const consoleDriverSchema = z.object({
  MAIL_DRIVER: z.literal("console"),
  MAIL_OUTBOX_DIR: z.string().min(1).default("./tmp/outbox"),
});

const mailDriverSchema = z
  .discriminatedUnion("MAIL_DRIVER", [
    commonEnvSchema.merge(mailgunDriverSchema),
    commonEnvSchema.merge(consoleDriverSchema),
  ])
  .transform((data) => {
    const { DOCS_ENABLED, ...rest } = data;
    const docsEnabled = DOCS_ENABLED !== undefined ? DOCS_ENABLED === "true" : rest.NODE_ENV !== "production";
    return { ...rest, DOCS_ENABLED: docsEnabled };
  });

export type Env = z.infer<typeof mailDriverSchema>;

function loadEnv(): Env {
  const parsed = mailDriverSchema.safeParse(process.env);

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    console.error("Invalid environment variables:", fieldErrors);
    throw new Error(`Invalid environment variables: ${Object.keys(fieldErrors).join(", ")}`);
  }

  return parsed.data;
}

export const env = loadEnv();
