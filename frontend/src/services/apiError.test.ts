import { describe, expect, it } from "vitest";
import { getApiErrorCode, getApiErrorMessage } from "@/services/apiError";

const apiBody = (code: string, message: string) => ({ error: { code, message } });

describe("getApiErrorMessage", () => {
  it("returns the server's message from an API error body", () => {
    const error = { status: 404, data: apiBody("INVOICE_NOT_FOUND", "Invoice not found") };
    expect(getApiErrorMessage(error)).toBe("Invoice not found");
  });

  it("explains a network failure instead of showing the fallback", () => {
    const error = { status: "FETCH_ERROR" as const, error: "TypeError: Failed to fetch" };
    expect(getApiErrorMessage(error, "fallback")).toMatch(/связаться с сервером/);
  });

  it("falls back for a response that isn't in the API error shape", () => {
    expect(getApiErrorMessage({ status: 502, data: "<html>Bad gateway</html>" }, "fallback")).toBe("fallback");
  });

  it("uses a serialized error's own message", () => {
    expect(getApiErrorMessage({ message: "boom" }, "fallback")).toBe("boom");
  });

  it("falls back when there is no error at all", () => {
    expect(getApiErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});

describe("getApiErrorCode", () => {
  it("returns the machine-readable code from an API error body", () => {
    expect(getApiErrorCode({ status: 409, data: apiBody("PDF_NOT_READY", "x") })).toBe("PDF_NOT_READY");
  });

  it("returns null for non-API errors", () => {
    expect(getApiErrorCode({ status: "FETCH_ERROR" as const, error: "x" })).toBeNull();
    expect(getApiErrorCode({ status: 500, data: "nope" })).toBeNull();
    expect(getApiErrorCode(undefined)).toBeNull();
  });
});
