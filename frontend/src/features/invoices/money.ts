export function majorToMinor(major: string | number): number {
  const value = typeof major === "string" ? Number.parseFloat(major) : major;
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function minorToMajor(minor: number): number {
  return minor / 100;
}

const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();

export function formatMoney(minor: number, currency: string): string {
  let formatter = CURRENCY_FORMATTERS.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("ru-RU", { style: "currency", currency });
    CURRENCY_FORMATTERS.set(currency, formatter);
  }
  return formatter.format(minorToMajor(minor));
}
