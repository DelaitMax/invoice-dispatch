export interface MoneyLineInput {
  readonly quantity: number;
  readonly unitAmountMinor: number;
}

export function computeLineAmountMinor(line: MoneyLineInput): number {
  return line.quantity * line.unitAmountMinor;
}

export function sumMinor(lines: readonly MoneyLineInput[]): number {
  return lines.reduce((total, line) => total + computeLineAmountMinor(line), 0);
}

const MINOR_UNITS_PER_MAJOR = 100;
const DISPLAY_LOCALE = "en-US";

export function formatMinor(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(DISPLAY_LOCALE, { style: "currency", currency }).format(
    amountMinor / MINOR_UNITS_PER_MAJOR,
  );
}
