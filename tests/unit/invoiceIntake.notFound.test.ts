import { describe, expect, it, vi } from "vitest";
import { createInvoice, type IntakeDeps } from "@/services/invoiceIntake.service";
import type { Logger } from "@/utils/logger";

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => fakeLogger()) };
}

function buildDeps(): IntakeDeps {
  return {
    db: { transaction: (cb: (tx: unknown) => unknown) => cb("tx") } as never,
    clients: { findByEmailWithCompany: vi.fn(async () => null) },
    invoices: { findByIdempotencyKey: vi.fn(async () => null), insert: vi.fn() },
    invoiceItems: { insertMany: vi.fn() },
    invoiceNumbers: { allocate: vi.fn() },
    invoiceEvents: { insert: vi.fn() },
    requests: {
      insert: vi.fn(async () => ({ id: 42 }) as never),
      markOutcome: vi.fn(async () => undefined),
    },
    pdfQueue: { add: vi.fn() },
    sender: {
      brand: "Test",
      name: "Test",
      email: "sender@example.com",
      phone: undefined,
      address: { line1: "1 St", line2: undefined, city: "City", postalCode: undefined, country: undefined },
    },
    invoiceDueDays: 14,
    clock: () => new Date("2026-01-01T00:00:00.000Z"),
    logger: fakeLogger(),
  };
}

describe("createInvoice — unknown client", () => {
  it("throws AppError(404, CLIENT_NOT_FOUND) and never opens the invoice transaction", async () => {
    const deps = buildDeps();

    await expect(
      createInvoice(
        {
          email: "nobody@example.com",
          currency: "USD",
          items: [{ description: "x", quantity: 1, unitAmountMinor: 100 }],
          audit: { rawBody: {}, ip: null, userAgent: null, requestId: "req-404" },
        },
        deps,
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: "CLIENT_NOT_FOUND" });

    expect(deps.invoices.insert).not.toHaveBeenCalled();
  });

  it("still writes the audit row before the client lookup, and marks it CLIENT_NOT_FOUND — a rollback never erases the request log", async () => {
    const deps = buildDeps();

    await expect(
      createInvoice(
        {
          email: "nobody@example.com",
          currency: "USD",
          items: [{ description: "x", quantity: 1, unitAmountMinor: 100 }],
          audit: { rawBody: { some: "payload" }, ip: "10.0.0.1", userAgent: "vitest", requestId: "req-404b" },
        },
        deps,
      ),
    ).rejects.toBeDefined();

    expect(deps.requests.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recipientEmail: "nobody@example.com", rawBody: { some: "payload" } }),
    );
    expect(deps.requests.markOutcome).toHaveBeenCalledWith(expect.anything(), 42, "CLIENT_NOT_FOUND");
  });
});
