import { describe, expect, it } from "vitest";
import { createInvoiceBodySchema } from "@/schemas/invoices.schema";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    email: "John.Doe@Acme.example",
    items: [{ description: "Consulting", quantity: 2, unitAmountMinor: 5000 }],
    ...overrides,
  };
}

describe("createInvoiceBodySchema", () => {
  it("accepts a minimal valid body and normalizes the email to lowercase/trimmed", () => {
    const result = createInvoiceBodySchema.parse(validBody());
    expect(result.email).toBe("john.doe@acme.example");
  });

  it("defaults currency to the configured default when omitted", () => {
    const result = createInvoiceBodySchema.parse(validBody());
    expect(result.currency).toBe("USD");
  });

  it("rejects an unsupported currency", () => {
    expect(() => createInvoiceBodySchema.parse(validBody({ currency: "JPY" }))).toThrow();
  });

  it("rejects a server-computed field the client should never send (.strict())", () => {
    expect(() => createInvoiceBodySchema.parse(validBody({ totalMinor: 999_999 }))).toThrow();
    expect(() => createInvoiceBodySchema.parse(validBody({ invoiceNumber: "INV-2026-000001" }))).toThrow();
  });

  it("rejects a line item that includes the server-computed amountMinor", () => {
    expect(() =>
      createInvoiceBodySchema.parse(
        validBody({ items: [{ description: "x", quantity: 1, unitAmountMinor: 100, amountMinor: 100 }] }),
      ),
    ).toThrow();
  });

  it("rejects quantity = 0", () => {
    expect(() =>
      createInvoiceBodySchema.parse(validBody({ items: [{ description: "x", quantity: 0, unitAmountMinor: 100 }] })),
    ).toThrow();
  });

  it("rejects an empty items array", () => {
    expect(() => createInvoiceBodySchema.parse(validBody({ items: [] }))).toThrow();
  });

  it("rejects more than 50 line items", () => {
    const items = Array.from({ length: 51 }, () => ({ description: "x", quantity: 1, unitAmountMinor: 100 }));
    expect(() => createInvoiceBodySchema.parse(validBody({ items }))).toThrow();
  });

  it("accepts exactly 50 line items", () => {
    const items = Array.from({ length: 50 }, () => ({ description: "x", quantity: 1, unitAmountMinor: 100 }));
    expect(() => createInvoiceBodySchema.parse(validBody({ items }))).not.toThrow();
  });

  it("rejects an invalid email", () => {
    expect(() => createInvoiceBodySchema.parse(validBody({ email: "not-an-email" }))).toThrow();
  });

  it("defaults quantity to 1 when omitted", () => {
    const result = createInvoiceBodySchema.parse(validBody({ items: [{ description: "x", unitAmountMinor: 100 }] }));
    expect(result.items[0]?.quantity).toBe(1);
  });
});
