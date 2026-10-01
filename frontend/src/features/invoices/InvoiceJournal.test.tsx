import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InvoiceJournal } from "@/features/invoices/InvoiceJournal";
import { useGetCurrentUserQuery } from "@/features/auth/authApi";
import { useGetInvoiceQuery, useLazyGetInvoiceQuery, useRetryInvoiceMutation } from "@/features/invoices/invoicesApi";
import { listJournalEntries } from "@/features/invoices/journal";

vi.mock("@/features/auth/authApi", () => ({
  useGetCurrentUserQuery: vi.fn(),
}));
vi.mock("@/features/invoices/invoicesApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/invoices/invoicesApi")>();
  return {
    ...actual,
    useGetInvoiceQuery: vi.fn(),
    useLazyGetInvoiceQuery: vi.fn(),
    useRetryInvoiceMutation: vi.fn(),
  };
});
vi.mock("@/features/invoices/journal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/invoices/journal")>();
  return { ...actual, listJournalEntries: vi.fn() };
});

const mockedUseGetInvoiceQuery = vi.mocked(useGetInvoiceQuery);
const mockedUseGetCurrentUserQuery = vi.mocked(useGetCurrentUserQuery);
const mockedListJournalEntries = vi.mocked(listJournalEntries);

function invoiceData(status: string) {
  return { invoiceId: "inv-1", invoiceNumber: "INV-1", status, currency: "USD", totalMinor: 1000 };
}

describe("InvoiceJournal row polling", () => {
  it("resumes polling after a retry moves the invoice out of a terminal status", () => {
    mockedUseGetCurrentUserQuery.mockReturnValue({ data: { id: "1", email: "a@example.com", role: "admin" } } as never);
    mockedListJournalEntries.mockReturnValue([
      { invoiceId: "inv-1", invoiceNumber: "INV-1", recipientEmail: "a@example.com", addedAt: "2026-01-01T00:00:00Z" },
    ]);
    vi.mocked(useLazyGetInvoiceQuery).mockReturnValue([vi.fn(), { isFetching: false }] as never);
    vi.mocked(useRetryInvoiceMutation).mockReturnValue([vi.fn(), { isLoading: false }] as never);

    mockedUseGetInvoiceQuery.mockReturnValue({ data: invoiceData("FAILED"), error: undefined } as never);
    const { rerender } = render(<InvoiceJournal refreshKey={0} />);

    const lastCallAfterFailed = mockedUseGetInvoiceQuery.mock.calls.at(-1);
    expect(lastCallAfterFailed?.[1]).toMatchObject({ pollingInterval: 0 });

    mockedUseGetInvoiceQuery.mockReturnValue({ data: invoiceData("PENDING"), error: undefined } as never);
    rerender(<InvoiceJournal refreshKey={0} />);

    const lastCallAfterRetry = mockedUseGetInvoiceQuery.mock.calls.at(-1);
    expect(lastCallAfterRetry?.[1]).toMatchObject({ pollingInterval: 2000 });
  });
});
