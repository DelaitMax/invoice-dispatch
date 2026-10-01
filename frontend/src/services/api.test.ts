import type { FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactiveBaseQuery, parseRetryAfterSeconds, QUIET_RETRY_DELAY_MS } from "@/services/api";

type RawResult = { data: unknown } | { error: FetchBaseQueryError; meta?: { response: Response } };

function apiError(status: number, code: string): FetchBaseQueryError {
  return { status, data: { error: { code, message: code } } };
}

function setup(...results: RawResult[]) {
  const raw = vi.fn();
  for (const result of results) raw.mockResolvedValueOnce(result);
  const dispatch = vi.fn();
  const baseQuery = createReactiveBaseQuery(raw as never);
  const run = (args: string | { url: string } = "/api/invoices/1") =>
    baseQuery(args, { dispatch, signal: new AbortController().signal } as never, {});
  return { raw, dispatch, run };
}

interface ToastAction {
  type: string;
  payload: { id: string; message: string; action?: string };
}

function toasts(dispatch: ReturnType<typeof vi.fn>): ToastAction[] {
  return dispatch.mock.calls.map(([action]) => action as ToastAction).filter((action) => action.type === "toasts/showToast");
}

function toastIds(dispatch: ReturnType<typeof vi.fn>): string[] {
  return dispatch.mock.calls
    .map(([action]) => action as { type: string; payload?: { id?: string } })
    .filter((action) => action.type === "toasts/showToast")
    .map((action) => action.payload?.id ?? "");
}

describe("parseRetryAfterSeconds", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfterSeconds("30")).toBe(30);
  });

  it("ignores HTTP-dates, junk, zero and missing values", () => {
    expect(parseRetryAfterSeconds("Wed, 21 Oct 2026 07:28:00 GMT")).toBeNull();
    expect(parseRetryAfterSeconds("abc")).toBeNull();
    expect(parseRetryAfterSeconds("0")).toBeNull();
    expect(parseRetryAfterSeconds(null)).toBeNull();
    expect(parseRetryAfterSeconds(undefined)).toBeNull();
  });
});

describe("createReactiveBaseQuery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes a successful result through untouched, with no side effects", async () => {
    const { run, dispatch, raw } = setup({ data: { ok: true } });
    await expect(run()).resolves.toEqual({ data: { ok: true } });
    expect(raw).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("invalidates the session on any 401", async () => {
    const { run, dispatch } = setup({ error: apiError(401, "NOT_AUTHENTICATED") });
    await run();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ type: "api/invalidateTags" });
  });

  it("toasts on 403 ADMIN_REQUIRED but not on other 403s", async () => {
    const admin = setup({ error: apiError(403, "ADMIN_REQUIRED") });
    await admin.run();
    expect(toastIds(admin.dispatch)).toEqual(["admin-required"]);

    const other = setup({ error: apiError(403, "SOMETHING_ELSE") });
    await other.run();
    expect(toastIds(other.dispatch)).toEqual([]);
  });

  it("toasts on 429 with the wait time from Retry-After", async () => {
    const response = new Response(null, { status: 429, headers: { "Retry-After": "42" } });
    const { run, dispatch } = setup({ error: apiError(429, "RATE_LIMITED"), meta: { response } });
    await run();
    expect(toastIds(dispatch)).toEqual(["rate-limited"]);
    expect(toasts(dispatch)[0]?.payload.message).toContain("42");
  });

  it("toasts on 429 without a number when Retry-After is absent", async () => {
    const response = new Response(null, { status: 429 });
    const { run, dispatch } = setup({ error: apiError(429, "RATE_LIMITED"), meta: { response } });
    await run();
    expect(toastIds(dispatch)).toEqual(["rate-limited"]);
    expect(toasts(dispatch)[0]?.payload.message).not.toMatch(/\d/);
  });

  it("toasts a network failure with a manual retry action", async () => {
    const { run, dispatch } = setup({ error: { status: "FETCH_ERROR", error: "x" } });
    await run();
    expect(toastIds(dispatch)).toEqual(["network"]);
    expect(toasts(dispatch)[0]?.payload.action).toBe("refetch");
  });

  it("does not toast network failures of the /health probe", async () => {
    const { run, dispatch } = setup({ error: { status: "FETCH_ERROR", error: "x" } });
    await run({ url: "/health/ready" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("retries a 409 PDF_NOT_READY once after the delay, silently", async () => {
    const { run, raw, dispatch } = setup({ error: apiError(409, "PDF_NOT_READY") }, { data: { ok: true } });
    const pending = run();
    await vi.advanceTimersByTimeAsync(QUIET_RETRY_DELAY_MS);
    await expect(pending).resolves.toEqual({ data: { ok: true } });
    expect(raw).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("gives up after a single quiet retry and still shows no toast", async () => {
    const { run, raw, dispatch } = setup(
      { error: apiError(409, "INVOICE_NOT_RETRYABLE") },
      { error: apiError(409, "INVOICE_NOT_RETRYABLE") },
    );
    const pending = run();
    await vi.advanceTimersByTimeAsync(QUIET_RETRY_DELAY_MS);
    const result = await pending;
    expect(result).toHaveProperty("error");
    expect(raw).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not retry other 409s", async () => {
    const { run, raw } = setup({ error: apiError(409, "IDEMPOTENCY_KEY_CONFLICT") });
    await run();
    expect(raw).toHaveBeenCalledTimes(1);
  });
});
