const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" });

export function formatDisplayDate(date: Date): string {
  return DISPLAY_DATE_FORMATTER.format(date);
}
