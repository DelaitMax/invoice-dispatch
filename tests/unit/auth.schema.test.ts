import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "@/schemas/auth.schema";

describe("loginSchema / registerSchema", () => {
  it.each([loginSchema, registerSchema])("normalizes email to lowercase/trimmed", (schema) => {
    const result = schema.parse({ email: "  John.Doe@Acme.example  ", password: "correct-horse-battery" });
    expect(result.email).toBe("john.doe@acme.example");
  });

  it.each([loginSchema, registerSchema])("rejects an invalid email", (schema) => {
    expect(() => schema.parse({ email: "not-an-email", password: "correct-horse-battery" })).toThrow();
  });

  it.each([loginSchema, registerSchema])("rejects a password shorter than 8 characters", (schema) => {
    expect(() => schema.parse({ email: "a@example.com", password: "short1" })).toThrow();
  });

  it.each([loginSchema, registerSchema])("rejects an unknown field (.strict())", (schema) => {
    expect(() =>
      schema.parse({ email: "a@example.com", password: "correct-horse-battery", role: "admin" }),
    ).toThrow();
  });
});
