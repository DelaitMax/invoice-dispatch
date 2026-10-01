import { describe, expect, it, vi } from "vitest";
import { createInvoice, type CreateInvoiceInput, type IntakeDeps } from "@/services/invoiceIntake.service";
import type { Logger } from "@/utils/logger";

const CLIENT = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "client@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  company: null,
};

const SENDER = {
  brand: "Test Brand",
  name: "Test Sender",
  email: "sender@example.com",
  phone: undefined,
  address: { line1: "1 Test Street", line2: undefined, city: "Test City", postalCode: undefined, country: undefined },
};

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => fakeLogger()) };
}

function baseInput(overrides: Partial<CreateInvoiceInput> = {}): CreateInvoiceInput {
  return {
    email: CLIENT.email,
    currency: "USD",
    items: [{ description: "Consulting", quantity: 2, unitAmountMinor: 5000 }],
    audit: { rawBody: {}, ip: "127.0.0.1", userAgent: "vitest", requestId: "req-1" },
    ...overrides,
  };
}

function buildDeps(callOrder: string[], overrides: Partial<IntakeDeps> = {}): IntakeDeps {
  const insertedInvoice = {
    id: "33333333-3333-4333-8333-333333333333",
    invoiceNumber: "INV-2026-000001",
    status: "PENDING",
    currency: "USD",
    totalMinor: 10_000,
    recipientEmail: CLIENT.email,
    issuedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  return {
    db: { transaction: (cb: (tx: unknown) => unknown) => cb("tx") } as never,
    clients: {
      findByEmailWithCompany: vi.fn(async () => {
        callOrder.push("clients.findByEmailWithCompany");
        return CLIENT;
      }),
    },
    invoices: {
      findByIdempotencyKey: vi.fn(async () => null),
      insert: vi.fn(async () => {
        callOrder.push("invoices.insert");
        return insertedInvoice as never;
      }),
    },
    invoiceItems: {
      insertMany: vi.fn(async () => {
        callOrder.push("invoiceItems.insertMany");
        return [];
      }),
    },
    invoiceNumbers: {
      allocate: vi.fn(async () => {
        callOrder.push("invoiceNumbers.allocate");
        return insertedInvoice.invoiceNumber;
      }),
    },
    invoiceEvents: {
      insert: vi.fn(async () => {
        callOrder.push("invoiceEvents.insert");
      }),
    },
    requests: {
      insert: vi.fn(async () => {
        callOrder.push("requests.insert");
        return { id: 1 } as never;
      }),
      markOutcome: vi.fn(async () => {
        callOrder.push("requests.markOutcome");
      }),
    },
    pdfQueue: { add: vi.fn(async () => ({}) as never) },
    sender: SENDER,
    invoiceDueDays: 14,
    clock: () => new Date("2026-01-01T00:00:00.000Z"),
    logger: fakeLogger(),
    ...overrides,
  };
}

describe("createInvoice", () => {
  it("calls audit insert, then client lookup, then the transaction, then marks the outcome, then enqueues — in that order", async () => {
    const callOrder: string[] = [];
    const deps = buildDeps(callOrder);

    await createInvoice(baseInput(), deps);

    expect(callOrder.indexOf("requests.insert")).toBe(0);
    expect(callOrder.indexOf("requests.insert")).toBeLessThan(callOrder.indexOf("clients.findByEmailWithCompany"));
    expect(callOrder.indexOf("clients.findByEmailWithCompany")).toBeLessThan(
      callOrder.indexOf("invoiceNumbers.allocate"),
    );
    expect(callOrder.indexOf("invoiceNumbers.allocate")).toBeLessThan(callOrder.indexOf("invoices.insert"));
    expect(callOrder.indexOf("invoices.insert")).toBeLessThan(callOrder.indexOf("invoiceItems.insertMany"));
    expect(callOrder.indexOf("invoiceItems.insertMany")).toBeLessThan(callOrder.indexOf("invoiceEvents.insert"));
    expect(callOrder.indexOf("invoiceEvents.insert")).toBeLessThan(callOrder.indexOf("requests.markOutcome"));
  });

  it("computes totalMinor from quantity * unitAmountMinor server-side", async () => {
    const callOrder: string[] = [];
    const deps = buildDeps(callOrder);

    await createInvoice(baseInput({ items: [{ description: "A", quantity: 3, unitAmountMinor: 1500 }] }), deps);

    expect(deps.invoices.insert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ totalMinor: 4500 }));
  });

  it("still returns a result and logs an error when the queue enqueue fails, instead of losing the request", async () => {
    const callOrder: string[] = [];
    const deps = buildDeps(callOrder, {
      pdfQueue: { add: vi.fn(async () => Promise.reject(new Error("Redis is down"))) },
    });

    const result = await createInvoice(baseInput(), deps);

    expect(result.invoiceId).toBe("33333333-3333-4333-8333-333333333333");
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to enqueue PDF render job"),
      expect.objectContaining({ invoiceId: result.invoiceId }),
    );
  });
});
