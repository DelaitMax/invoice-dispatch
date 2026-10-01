import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/app";
import { senderProfile } from "@/config/sender";
import { closeDb, db } from "@/db/client";
import { allocateInvoiceNumber } from "@/repositories/invoiceNumbers.repository";
import { insertInvoice } from "@/repositories/invoices.repository";
import { transition } from "@/services/invoiceStatus.service";
import { logger } from "@/utils/logger";
import { seedTestFixtures, TEST_CLIENT_ID, TEST_CLIENT_EMAIL, TEST_COMPANY_ID } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";
import { loginAsAdmin, loginAsUser } from "./helpers/auth";

vi.mock("@/queue/pdfQueue", () => ({
  pdfQueue: { add: vi.fn(async () => ({}) as never) },
}));

const app = createApp();

beforeAll(async () => {
  await seedTestFixtures();
});

beforeEach(async () => {
  await truncateInvoiceTables();
});

afterAll(async () => {
  await closeDb();
});

async function createFailedInvoice(): Promise<string> {
  const invoiceNumber = await allocateInvoiceNumber(db, 2026);
  const invoice = await insertInvoice(db, {
    invoiceNumber,
    clientId: TEST_CLIENT_ID,
    companyId: TEST_COMPANY_ID,
    recipientEmail: TEST_CLIENT_EMAIL,
    currency: "USD",
    totalMinor: 5000,
    billingSnapshot: {
      client: { firstName: "Ivy", lastName: "Tester", email: TEST_CLIENT_EMAIL, company: null },
      sender: {
        brand: senderProfile.brand,
        name: senderProfile.name,
        email: senderProfile.email,
        phone: senderProfile.phone ?? null,
        address: {
          line1: senderProfile.address.line1,
          line2: senderProfile.address.line2 ?? null,
          city: senderProfile.address.city,
          postalCode: senderProfile.address.postalCode ?? null,
          country: senderProfile.address.country ?? null,
        },
      },
      currency: "USD",
      issuedAt: new Date().toISOString(),
    },
    notes: null,
    issuedAt: new Date(),
    dueAt: null,
    idempotencyKey: null,
    requestHash: null,
  });

  await transition(db, { logger }, invoice.id, ["PENDING"], "FAILED", {
    lastError: "simulated failure for the retry test",
  });

  return invoice.id;
}

describe("POST /auth/register, /auth/login, /auth/logout, GET /auth/me", () => {
  it("registers, sets a session cookie, and returns the new user", async () => {
    const email = `register-${crypto.randomUUID()}@example.com`;
    const response = await request(app).post("/auth/register").send({ email, password: "correct-horse-battery" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ email, role: "user" });
    expect(response.headers["set-cookie"]?.[0]).toContain("auth_token=");
  });

  it("rejects registering the same email twice", async () => {
    const email = `dup-${crypto.randomUUID()}@example.com`;
    const body = { email, password: "correct-horse-battery" };

    const first = await request(app).post("/auth/register").send(body);
    expect(first.status).toBe(201);

    const second = await request(app).post("/auth/register").send(body);
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("logs in with the right password and rejects the wrong one", async () => {
    const email = `login-${crypto.randomUUID()}@example.com`;
    await request(app).post("/auth/register").send({ email, password: "correct-horse-battery" });

    const wrong = await request(app).post("/auth/login").send({ email, password: "totally-wrong-password" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");

    const right = await request(app).post("/auth/login").send({ email, password: "correct-horse-battery" });
    expect(right.status).toBe(200);
    expect(right.body.email).toBe(email);
  });

  it("GET /auth/me requires a session and echoes the logged-in user", async () => {
    const anonymous = await request(app).get("/auth/me");
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe("NOT_AUTHENTICATED");

    const cookie = await loginAsUser(app);
    const authenticated = await request(app).get("/auth/me").set("Cookie", cookie);
    expect(authenticated.status).toBe(200);
    expect(authenticated.body.role).toBe("user");
  });

  it("logout returns 204 and tells the browser to clear the session cookie", async () => {
    const logoutResponse = await request(app).post("/auth/logout");
    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.headers["set-cookie"]?.[0]).toContain("auth_token=;");
  });
});

describe("Role-gated retry", () => {
  it("returns 403 for a logged-in user without the admin role", async () => {
    const invoiceId = await createFailedInvoice();
    const cookie = await loginAsUser(app);

    const response = await request(app).post(`/api/invoices/${invoiceId}/retry`).set("Cookie", cookie);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ADMIN_REQUIRED");
  });

  it("allows retry for an admin and moves the invoice back to PENDING", async () => {
    const invoiceId = await createFailedInvoice();
    const cookie = await loginAsAdmin(app);

    const response = await request(app).post(`/api/invoices/${invoiceId}/retry`).set("Cookie", cookie);

    expect(response.status).toBe(202);
    expect(response.body.status).toBe("PENDING");
  });
});
