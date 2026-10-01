import type { Database } from "@/db/client";
import { findUserByEmail, findUserById, insertUser, type UserRow } from "@/repositories/users.repository";
import { AppError } from "@/utils/AppError";
import { hashPassword, verifyPassword } from "@/utils/password";

export async function authenticate(db: Database, email: string, password: string): Promise<UserRow> {
  const user = await findUserByEmail(db, email);

  if (!user) {
    throw AppError.unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw AppError.unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }

  return user;
}

export async function getUserById(db: Database, id: string): Promise<UserRow | null> {
  return findUserById(db, id);
}

export async function registerUser(db: Database, email: string, password: string): Promise<UserRow> {
  const existing = await findUserByEmail(db, email);
  if (existing) {
    throw AppError.badRequest("A user with this email already exists", "EMAIL_TAKEN");
  }

  const passwordHash = await hashPassword(password);
  const created = await insertUser(db, { email, passwordHash, role: "user" });

  if (!created) {
    throw AppError.badRequest("A user with this email already exists", "EMAIL_TAKEN");
  }

  return created;
}
