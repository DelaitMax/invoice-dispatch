import { describe, expect, it } from "vitest";
import { classifyMailError, isNoResponseError } from "@/mail/errors";

const apiError = (status: number, message: string) => ({ status, message, details: "x", type: "MailgunAPIError" });

describe("classifyMailError", () => {
  it.each([400, 406, 413])("HTTP %i with a reason phrase is the invoice's problem: permanent", (status) => {
    expect(classifyMailError(apiError(status, "Bad Request"))).toBe("permanent");
  });

  it.each([401, 403, 404])("HTTP %i is the deployment's problem: configuration", (status) => {
    expect(classifyMailError(apiError(status, "Unauthorized"))).toBe("configuration");
  });

  it.each([429, 500, 502, 503, 504])("HTTP %i is temporary", (status) => {
    expect(classifyMailError(apiError(status, "Service Unavailable"))).toBe("temporary");
  });

  it.each(["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNABORTED", "EAI_AGAIN", "ERR_NETWORK"])(
    "status 400 with transport code %s means no response: temporary",
    (code) => {
      expect(classifyMailError(apiError(400, code))).toBe("temporary");
    },
  );

  it("status 400 with no message at all (an error with no code) is a failure before any response: temporary", () => {
    expect(classifyMailError({ status: 400 })).toBe("temporary");
    expect(classifyMailError({ status: 400, message: "" })).toBe("temporary");
  });

  it.each(["ERR_BAD_REQUEST", "ERR_BAD_RESPONSE"])(
    "axios's own HTTP-status code %s (what mailgun.js falls back to when the server sent no reason phrase) is a real response: permanent",
    (code) => {
      expect(classifyMailError(apiError(400, code))).toBe("permanent");
    },
  );

  it("a plain Error or any non-object thrown value is temporary rather than throwing itself", () => {
    expect(classifyMailError(new Error("boom"))).toBe("temporary");
    expect(classifyMailError("a string was thrown")).toBe("temporary");
    expect(classifyMailError(null)).toBe("temporary");
    expect(classifyMailError(undefined)).toBe("temporary");
  });
});

describe("isNoResponseError", () => {
  it("is false for anything but status 400, even with a transport-looking message", () => {
    expect(isNoResponseError(apiError(503, "ECONNRESET"))).toBe(false);
    expect(isNoResponseError({ message: "ECONNRESET" })).toBe(false);
  });
});
