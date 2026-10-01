import jwt from "jsonwebtoken";
import { env } from "@/config/env";

export type UserRole = "admin" | "user";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN_SECONDS });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === "string") return null;
    if (
      typeof decoded["sub"] !== "string" ||
      typeof decoded["email"] !== "string" ||
      (decoded["role"] !== "admin" && decoded["role"] !== "user")
    ) {
      return null;
    }
    return { sub: decoded["sub"], email: decoded["email"], role: decoded["role"] };
  } catch {
    return null;
  }
}
