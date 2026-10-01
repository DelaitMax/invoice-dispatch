import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate, registerUser } from "@/services/auth.service";
import { AppError } from "@/utils/AppError";

const { findUserByEmailMock, insertUserMock, verifyPasswordMock, hashPasswordMock } = vi.hoisted(() => ({
  findUserByEmailMock: vi.fn(),
  insertUserMock: vi.fn(),
  verifyPasswordMock: vi.fn(),
  hashPasswordMock: vi.fn(),
}));

vi.mock("@/repositories/users.repository", () => ({
  findUserByEmail: findUserByEmailMock,
  insertUser: insertUserMock,
}));

vi.mock("@/utils/password", () => ({
  verifyPassword: verifyPasswordMock,
  hashPassword: hashPasswordMock,
}));

const DB = {} as never;
const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ada@example.com",
  passwordHash: "real-hash",
  role: "user" as const,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

async function captureRejection(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
    throw new Error("expected the promise to reject, but it resolved");
  } catch (err) {
    return err as AppError;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authenticate", () => {
  it("returns the user when the email exists and the password matches its hash", async () => {
    findUserByEmailMock.mockResolvedValue(USER);
    verifyPasswordMock.mockResolvedValue(true);

    await expect(authenticate(DB, USER.email, "correct-password")).resolves.toEqual(USER);
    expect(verifyPasswordMock).toHaveBeenCalledWith("correct-password", "real-hash");
  });

  it("rejects with INVALID_CREDENTIALS when the password doesn't match", async () => {
    findUserByEmailMock.mockResolvedValue(USER);
    verifyPasswordMock.mockResolvedValue(false);

    await expect(authenticate(DB, USER.email, "wrong-password")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
    });
  });

  it(
    "still calls verifyPassword (against a fixed dummy hash) when no user exists for the email, " +
      "so a nonexistent account and a wrong password take the same code path -- not doing this " +
      "would let a caller enumerate registered emails by how fast /auth/login responds",
    async () => {
      findUserByEmailMock.mockResolvedValue(null);
      verifyPasswordMock.mockResolvedValue(false);

      await expect(authenticate(DB, "nobody@example.com", "anything")).rejects.toMatchObject({
        code: "INVALID_CREDENTIALS",
        statusCode: 401,
      });

      expect(verifyPasswordMock).toHaveBeenCalledTimes(1);
      const [, hashUsed] = verifyPasswordMock.mock.calls[0] as [string, string];
      expect(hashUsed).not.toBe("real-hash");
      expect(hashUsed).toMatch(/^\$2[aby]\$/); // a real bcrypt-shaped hash, not "" or undefined
    },
  );

  it("rejects with the same INVALID_CREDENTIALS error whether the user is missing or the password is wrong (no distinguishing signal in the response)", async () => {
    findUserByEmailMock.mockResolvedValue(null);
    verifyPasswordMock.mockResolvedValue(false);
    const missingUserError = await captureRejection(authenticate(DB, "nobody@example.com", "x"));

    findUserByEmailMock.mockResolvedValue(USER);
    verifyPasswordMock.mockResolvedValue(false);
    const wrongPasswordError = await captureRejection(authenticate(DB, USER.email, "x"));

    expect(missingUserError.message).toBe(wrongPasswordError.message);
    expect(missingUserError.code).toBe(wrongPasswordError.code);
    expect(missingUserError.statusCode).toBe(wrongPasswordError.statusCode);
  });
});

describe("registerUser", () => {
  it("hashes the password and creates a new user with the fixed 'user' role", async () => {
    findUserByEmailMock.mockResolvedValue(null);
    hashPasswordMock.mockResolvedValue("hashed");
    insertUserMock.mockResolvedValue(USER);

    await expect(registerUser(DB, USER.email, "a-real-password")).resolves.toEqual(USER);
    expect(insertUserMock).toHaveBeenCalledWith(DB, { email: USER.email, passwordHash: "hashed", role: "user" });
  });

  it("rejects with EMAIL_TAKEN when the email is already registered", async () => {
    findUserByEmailMock.mockResolvedValue(USER);

    await expect(registerUser(DB, USER.email, "whatever")).rejects.toMatchObject({
      code: "EMAIL_TAKEN",
      statusCode: 400,
    });
    expect(insertUserMock).not.toHaveBeenCalled();
  });

  it("rejects with EMAIL_TAKEN when insertUser loses a concurrent-registration race (onConflictDoNothing returns null)", async () => {
    findUserByEmailMock.mockResolvedValue(null);
    hashPasswordMock.mockResolvedValue("hashed");
    insertUserMock.mockResolvedValue(null);

    await expect(registerUser(DB, USER.email, "whatever")).rejects.toMatchObject({
      code: "EMAIL_TAKEN",
      statusCode: 400,
    });
  });
});
