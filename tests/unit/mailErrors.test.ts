import { describe, expect, it } from "vitest";
import { isPermanentMailError } from "@/mail/errors";

describe("isPermanentMailError", () => {
  it.each([400, 401, 403, 404, 406, 413])("treats HTTP %i as permanent", (status) => {
    expect(isPermanentMailError({ status })).toBe(true);
  });

  it.each([429, 500, 502, 503])("treats HTTP %i as temporary", (status) => {
    expect(isPermanentMailError({ status })).toBe(false);
  });

  it("treats a network error with no HTTP status (e.g. ECONNRESET) as temporary", () => {
    const err = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    expect(isPermanentMailError(err)).toBe(false);
  });

  it("treats a plain Error with no status as temporary", () => {
    expect(isPermanentMailError(new Error("boom"))).toBe(false);
  });

  it("treats non-object thrown values as temporary rather than throwing itself", () => {
    expect(isPermanentMailError("a string was thrown")).toBe(false);
    expect(isPermanentMailError(null)).toBe(false);
    expect(isPermanentMailError(undefined)).toBe(false);
  });
});
