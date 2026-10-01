import type { Express } from "express";
import request from "supertest";
import { db } from "@/db/client";
import { insertUser } from "@/repositories/users.repository";
import { hashPassword } from "@/utils/password";

const TEST_PASSWORD = "test-password-12345";

export async function loginAsUser(app: Express): Promise<string> {
  const email = `user-${crypto.randomUUID()}@example.com`;
  const response = await request(app).post("/auth/register").send({ email, password: TEST_PASSWORD });
  return extractCookie(response);
}

export async function loginAsAdmin(app: Express): Promise<string> {
  const email = `admin-${crypto.randomUUID()}@example.com`;
  const passwordHash = await hashPassword(TEST_PASSWORD);
  await insertUser(db, { email, passwordHash, role: "admin" });

  const response = await request(app).post("/auth/login").send({ email, password: TEST_PASSWORD });
  return extractCookie(response);
}

function extractCookie(response: request.Response): string {
  const setCookie = response.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = setCookie?.[0];
  if (!cookie) {
    throw new Error(`Expected a Set-Cookie header, got ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return cookie;
}
