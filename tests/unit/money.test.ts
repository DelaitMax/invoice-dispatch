import { describe, expect, it } from "vitest";
import { computeLineAmountMinor, formatMinor, sumMinor } from "@/utils/money";

describe("sumMinor", () => {
  it("sums a long list of lines exactly, without float drift", () => {
    const lines = Array.from({ length: 1000 }, (_, i) => ({ quantity: i + 1, unitAmountMinor: 137 }));
    const expected = lines.reduce((total, line) => total + line.quantity * line.unitAmountMinor, 0);

    expect(sumMinor(lines)).toBe(expected);
  });

  it("returns 0 for an empty list", () => {
    expect(sumMinor([])).toBe(0);
  });

  it("handles fractional-looking cents amounts correctly (integer minor units, never float dollars)", () => {
    const lines = [
      { quantity: 1, unitAmountMinor: 10 },
      { quantity: 1, unitAmountMinor: 10 },
      { quantity: 1, unitAmountMinor: 10 },
    ];

    expect(sumMinor(lines)).toBe(30);
  });
});

describe("computeLineAmountMinor", () => {
  it("multiplies quantity by unitAmountMinor", () => {
    expect(computeLineAmountMinor({ quantity: 3, unitAmountMinor: 250 })).toBe(750);
  });
});

describe("formatMinor", () => {
  it("formats 0", () => {
    expect(formatMinor(0, "USD")).toBe("$0.00");
  });

  it("formats 5 (sub-dollar amounts render correctly, not truncated to $0)", () => {
    expect(formatMinor(5, "USD")).toBe("$0.05");
  });

  it("formats 100000", () => {
    expect(formatMinor(100_000, "USD")).toBe("$1,000.00");
  });

  it("uses the given currency's symbol, not always $", () => {
    expect(formatMinor(100_000, "EUR")).toBe("€1,000.00");
    expect(formatMinor(100_000, "GBP")).toBe("£1,000.00");
  });
});
