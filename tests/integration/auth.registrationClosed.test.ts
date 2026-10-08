import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("REGISTRATION_ENABLED", "false");
});

import { createApp } from "@/app";
import { closeDb, db } from "@/db/client";
import { insertUser } from "@/repositories/users.repository";
import { hashPassword } from "@/utils/password";

const app = createApp();

afterAll(async () => {
  await closeDb();
});

describe("with REGISTRATION_ENABLED=false (the production default)", () => {
  it("POST /auth/register is refused with 403 REGISTRATION_DISABLED and sets no session", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ email: `closed-${crypto.randomUUID()}@example.com`, password: "a-good-password-1" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("REGISTRATION_DISABLED");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("no longer reveals which emails have accounts: an existing email gets the very same answer", async () => {
    const email = `existing-${crypto.randomUUID()}@example.com`;
    await insertUser(db, { email, passwordHash: await hashPassword("a-good-password-1"), role: "user" });

    const existing = await request(app).post("/auth/register").send({ email, password: "another-password-2" });
    const fresh = await request(app)
      .post("/auth/register")
      .send({ email: `fresh-${crypto.randomUUID()}@example.com`, password: "another-password-2" });

    expect(existing.status).toBe(403);
    expect(existing.body).toEqual(fresh.body);
    expect(existing.body.error.code).not.toBe("EMAIL_TAKEN");
  });

  it("login keeps working for accounts the operator created", async () => {
    const email = `operator-${crypto.randomUUID()}@example.com`;
    await insertUser(db, { email, passwordHash: await hashPassword("a-good-password-1"), role: "user" });

    const response = await request(app).post("/auth/login").send({ email, password: "a-good-password-1" });

    expect(response.status).toBe(200);
  });
});
