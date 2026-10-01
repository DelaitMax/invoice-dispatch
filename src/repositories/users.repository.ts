import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { users } from "@/db/schema";

export type UserRow = typeof users.$inferSelect;

export interface NewUserInput {
  readonly email: string;
  readonly passwordHash: string;
  readonly role: "admin" | "user";
}

export async function findUserByEmail(db: Database, email: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function findUserById(db: Database, id: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function insertUser(db: Database, input: NewUserInput): Promise<UserRow | null> {
  const rows = await db.insert(users).values(input).onConflictDoNothing({ target: users.email }).returning();
  return rows[0] ?? null;
}
