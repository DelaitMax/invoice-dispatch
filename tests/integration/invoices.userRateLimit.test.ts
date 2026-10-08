import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("USER_INVOICE_RATE_LIMIT_MAX", "2");
});

vi.mock("@/queue/pdfQueue", () => ({
  pdfQueue: { add: vi.fn(async () => ({}) as never) },
}));

import { createApp } from "@/app";
import { closeDb } from "@/db/client";
import { seedTestFixtures, TEST_CLIENT_EMAIL } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";
import { loginAsUser } from "./helpers/auth";

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

function create(cookie: string) {
  return request(app)
    .post("/api/invoices")
    .set("Cookie", cookie)
    .send({ email: TEST_CLIENT_EMAIL, items: [{ description: "Quota test", quantity: 1, unitAmountMinor: 100 }] });
}

describe("per-account invoice quota (on top of the per-IP limit)", () => {
  it("stops one account at its budget, with a distinct error, while another account — same IP — is unaffected", async () => {
    const heavyUser = await loginAsUser(app);
    const otherUser = await loginAsUser(app);

    expect((await create(heavyUser)).status).toBe(202);
    expect((await create(heavyUser)).status).toBe(202);

    const blocked = await create(heavyUser);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("USER_RATE_LIMITED");

    expect((await create(otherUser)).status).toBe(202);
  });
});
