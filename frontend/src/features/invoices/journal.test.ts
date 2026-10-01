import { beforeEach, describe, expect, it } from "vitest";
import { addJournalEntry, listJournalEntries, removeJournalEntry } from "@/features/invoices/journal";

beforeEach(() => {
  localStorage.clear();
});

describe("journal", () => {
  it("starts empty", () => {
    expect(listJournalEntries()).toEqual([]);
  });

  it("adds an entry and lists it back", () => {
    addJournalEntry({ invoiceId: "1", invoiceNumber: "INV-1", recipientEmail: "a@example.com" });
    const entries = listJournalEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ invoiceId: "1", invoiceNumber: "INV-1" });
  });

  it("lists newest first", () => {
    addJournalEntry({ invoiceId: "1", invoiceNumber: "INV-1", recipientEmail: "a@example.com" });
    addJournalEntry({ invoiceId: "2", invoiceNumber: "INV-2", recipientEmail: "b@example.com" });
    expect(listJournalEntries().map((entry) => entry.invoiceId)).toEqual(["2", "1"]);
  });

  it("de-duplicates by invoiceId (re-adding replaces, doesn't duplicate)", () => {
    addJournalEntry({ invoiceId: "1", invoiceNumber: "INV-1", recipientEmail: "a@example.com" });
    addJournalEntry({ invoiceId: "1", invoiceNumber: "INV-1", recipientEmail: "a@example.com" });
    expect(listJournalEntries()).toHaveLength(1);
  });

  it("removes an entry", () => {
    addJournalEntry({ invoiceId: "1", invoiceNumber: "INV-1", recipientEmail: "a@example.com" });
    removeJournalEntry("1");
    expect(listJournalEntries()).toEqual([]);
  });

  it("ignores corrupt data instead of throwing", () => {
    localStorage.setItem("invoice-dispatch:journal:v1", "{not json");
    expect(listJournalEntries()).toEqual([]);
  });
});
