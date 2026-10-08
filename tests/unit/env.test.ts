import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("loadEnv", () => {
  it("throws when MAIL_DRIVER=mailgun but MAILGUN_API_KEY/MAILGUN_DOMAIN are missing (no silent startup without mail)", async () => {
    process.env["MAIL_DRIVER"] = "mailgun";
    delete process.env["MAILGUN_API_KEY"];
    delete process.env["MAILGUN_DOMAIN"];

    await expect(import("@/config/env")).rejects.toThrow(/Invalid environment variables/);
  });

  it("throws when only one of MAILGUN_API_KEY/MAILGUN_DOMAIN is present", async () => {
    process.env["MAIL_DRIVER"] = "mailgun";
    process.env["MAILGUN_API_KEY"] = "key-123";
    delete process.env["MAILGUN_DOMAIN"];

    await expect(import("@/config/env")).rejects.toThrow(/Invalid environment variables/);
  });

  it("succeeds when MAIL_DRIVER=mailgun and both credentials are present", async () => {
    process.env["MAIL_DRIVER"] = "mailgun";
    process.env["MAILGUN_API_KEY"] = "key-123";
    process.env["MAILGUN_DOMAIN"] = "mg.example.com";

    const { env } = await import("@/config/env");

    expect(env.MAIL_DRIVER).toBe("mailgun");
  });

  it("succeeds with MAIL_DRIVER=console and no mailgun credentials at all", async () => {
    process.env["MAIL_DRIVER"] = "console";
    delete process.env["MAILGUN_API_KEY"];
    delete process.env["MAILGUN_DOMAIN"];

    const { env } = await import("@/config/env");

    expect(env.MAIL_DRIVER).toBe("console");
  });

  it("throws when DATABASE_URL is missing entirely", async () => {
    delete process.env["DATABASE_URL"];

    await expect(import("@/config/env")).rejects.toThrow(/Invalid environment variables/);
  });

  it.each([
    ["production", undefined, false],
    ["development", undefined, true],
    ["test", undefined, true],
    ["production", "true", true],
    ["development", "false", false],
  ])("REGISTRATION_ENABLED in NODE_ENV=%s with %s resolves to %s", async (nodeEnv, explicit, expected) => {
    process.env["NODE_ENV"] = nodeEnv;
    if (explicit === undefined) {
      delete process.env["REGISTRATION_ENABLED"];
    } else {
      process.env["REGISTRATION_ENABLED"] = explicit;
    }

    const { env } = await import("@/config/env");

    expect(env.REGISTRATION_ENABLED).toBe(expected);
  });

  it("rejects QUEUE_LEASE_MS that does not outlast PDF_TIMEOUT_MS (a render must never outlive its lease)", async () => {
    process.env["PDF_TIMEOUT_MS"] = "20000";
    process.env["QUEUE_LEASE_MS"] = "20000";

    await expect(import("@/config/env")).rejects.toThrow(/QUEUE_LEASE_MS/);
  });
});
