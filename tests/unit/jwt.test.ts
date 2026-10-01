import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { env } from "@/config/env";
import { signAuthToken, verifyAuthToken } from "@/utils/jwt";

const PAYLOAD = { sub: "11111111-1111-4111-8111-111111111111", email: "person@example.com", role: "user" as const };

describe("signAuthToken / verifyAuthToken", () => {
  it("round-trips a token signed by this app", () => {
    const token = signAuthToken(PAYLOAD);
    expect(verifyAuthToken(token)).toEqual(PAYLOAD);
  });

  it("returns null for a token signed with a different secret", () => {
    const token = jwt.sign(PAYLOAD, "some-other-secret-of-sufficient-length");
    expect(verifyAuthToken(token)).toBeNull();
  });

  it("returns null for an expired token", () => {
    const token = jwt.sign(PAYLOAD, env.JWT_SECRET, { expiresIn: -1 });
    expect(verifyAuthToken(token)).toBeNull();
  });

  it("returns null for a garbage string", () => {
    expect(verifyAuthToken("not.a.jwt")).toBeNull();
  });

  it("returns null for a validly-signed token missing the fields this app needs", () => {
    const token = jwt.sign({ sub: PAYLOAD.sub }, env.JWT_SECRET);
    expect(verifyAuthToken(token)).toBeNull();
  });

  it("returns null for a validly-signed token with an unrecognized role", () => {
    const token = jwt.sign({ ...PAYLOAD, role: "superadmin" }, env.JWT_SECRET);
    expect(verifyAuthToken(token)).toBeNull();
  });
});
