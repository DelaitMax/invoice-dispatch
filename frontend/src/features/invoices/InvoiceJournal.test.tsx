import { render, screen } from "@testing-library/react";
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

function renderJournalWith(options: { status?: string; role?: "admin" | "user"; error?: unknown }) {
  mockedUseGetCurrentUserQuery.mockReturnValue({
    data: { id: "1", email: "a@example.com", role: options.role ?? "user" },
  } as never);
  mockedListJournalEntries.mockReturnValue([
    { invoiceId: "inv-1", invoiceNumber: "INV-1", recipientEmail: "a@example.com", addedAt: "2026-01-01T00:00:00Z" },
  ]);
  vi.mocked(useLazyGetInvoiceQuery).mockReturnValue([vi.fn(), { isFetching: false }] as never);
  vi.mocked(useRetryInvoiceMutation).mockReturnValue([vi.fn(), { isLoading: false }] as never);
  mockedUseGetInvoiceQuery.mockReturnValue({
    data: options.status ? invoiceData(options.status) : undefined,
    error: options.error,
  } as never);
  render(<InvoiceJournal refreshKey={0} />);
}

describe("InvoiceJournal row by status", () => {
  it.each([
    { status: "PENDING", label: "В очереди", pdf: false },
    { status: "PDF_RENDERING", label: "Готовим PDF", pdf: false },
    { status: "PDF_READY", label: "PDF готов, отправляем", pdf: true },
    { status: "EMAIL_SENDING", label: "Отправляем письмо", pdf: true },
    { status: "SENT", label: "Отправлено", pdf: true },
    { status: "FAILED", label: "Ошибка", pdf: false },
  ])("$status shows its badge and a $pdf download state", ({ status, label, pdf }) => {
    renderJournalWith({ status });

    expect(screen.getByText(label)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Скачать PDF" });
    if (pdf) {
      expect(link).toHaveAttribute("href", "/api/invoices/inv-1/pdf");
      expect(link).not.toHaveAttribute("aria-disabled");
    } else {
      expect(link).not.toHaveAttribute("href");
      expect(link).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("shows retry for a FAILED invoice to an admin", () => {
    renderJournalWith({ status: "FAILED", role: "admin" });
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });

  it("hides retry for a FAILED invoice from a regular user", () => {
    renderJournalWith({ status: "FAILED", role: "user" });
    expect(screen.queryByRole("button", { name: "Повторить" })).not.toBeInTheDocument();
  });

  it.each(["PENDING", "PDF_RENDERING", "PDF_READY", "EMAIL_SENDING", "SENT"])(
    "hides retry for a %s invoice even from an admin",
    (status) => {
      renderJournalWith({ status, role: "admin" });
      expect(screen.queryByRole("button", { name: "Повторить" })).not.toBeInTheDocument();
    },
  );

  it("offers to remove an entry the server no longer knows, instead of dropping it silently", () => {
    renderJournalWith({
      error: { status: 404, data: { error: { code: "INVOICE_NOT_FOUND", message: "Invoice not found" } } },
    });

    expect(screen.getByText(/Не найден на сервере/)).toHaveTextContent("убрать запись из журнала?");
    expect(screen.getByRole("button", { name: "Убрать" })).toBeInTheDocument();
    expect(screen.getByText("INV-1")).toBeInTheDocument();
  });

  it("keeps the PDF link disabled while the first poll is still loading", () => {
    renderJournalWith({});
    expect(screen.getByRole("link", { name: "Скачать PDF" })).toHaveAttribute("aria-disabled", "true");
  });
});
