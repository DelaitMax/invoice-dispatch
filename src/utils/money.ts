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
