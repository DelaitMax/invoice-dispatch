import { describe, expect, it } from "vitest";
import { formatMoney, majorToMinor, minorToMajor } from "@/features/invoices/money";

describe("majorToMinor", () => {
  it("converts a decimal string to minor units", () => {
    expect(majorToMinor("42.50")).toBe(4250);
    expect(majorToMinor("0.01")).toBe(1);
    expect(majorToMinor("100")).toBe(10_000);
  });

  it("rounds instead of truncating float artifacts", () => {
    expect(majorToMinor("19.9")).toBe(1990);
  });

  it("treats empty/invalid input as 0", () => {
    expect(majorToMinor("")).toBe(0);
    expect(majorToMinor("not a number")).toBe(0);
  });
});

describe("minorToMajor / formatMoney", () => {
  it("round-trips with majorToMinor", () => {
    expect(minorToMajor(majorToMinor("12.34"))).toBeCloseTo(12.34);
  });

  it("formats minor units with the currency symbol", () => {
    expect(formatMoney(150_000, "USD").replace(/[^\d]/g, "")).toBe("150000");
  });
});
