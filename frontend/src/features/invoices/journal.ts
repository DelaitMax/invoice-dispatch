const STORAGE_KEY = "invoice-dispatch:journal:v1";

export interface JournalEntry {
  invoiceId: string;
  invoiceNumber: string;
  recipientEmail: string;
  addedAt: string;
}

function readAll(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JournalEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: JournalEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

export function listJournalEntries(): JournalEntry[] {
  return [...readAll()].reverse();
}

export function addJournalEntry(entry: Omit<JournalEntry, "addedAt">): void {
  const entries = readAll().filter((existing) => existing.invoiceId !== entry.invoiceId);
  entries.push({ ...entry, addedAt: new Date().toISOString() });
  writeAll(entries);
}

export function removeJournalEntry(invoiceId: string): void {
  writeAll(readAll().filter((entry) => entry.invoiceId !== invoiceId));
}
