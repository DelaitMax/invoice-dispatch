import { describe, expect, it } from "vitest";
import { formatInvoiceNumber } from "@/repositories/invoiceNumbers.repository";

describe("formatInvoiceNumber", () => {
  it("formats as INV-YYYY-NNNNNN with zero-padding to 6 digits", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("INV-2026-000001");
    expect(formatInvoiceNumber(2026, 42)).toBe("INV-2026-000042");
    expect(formatInvoiceNumber(2026, 999_999)).toBe("INV-2026-999999");
  });

  it("does not truncate a sequence wider than the pad width", () => {
    expect(formatInvoiceNumber(2026, 1_234_567)).toBe("INV-2026-1234567");
  });

  it("uses the given year, not the current one", () => {
    expect(formatInvoiceNumber(2019, 7)).toBe("INV-2019-000007");
  });

  it("produces no collisions across a run of sequence numbers for the same year", () => {
    const numbers = Array.from({ length: 500 }, (_, i) => formatInvoiceNumber(2026, i + 1));
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
