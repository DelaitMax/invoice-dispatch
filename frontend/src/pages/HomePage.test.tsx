import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateInvoiceMutation } from "@/features/invoices/invoicesApi";
import { HomePage } from "@/pages/HomePage";
import { useIsServiceUnavailable } from "@/services/healthApi";

vi.mock("@/services/healthApi", () => ({ useIsServiceUnavailable: vi.fn() }));
vi.mock("@/features/invoices/invoicesApi", () => ({ useCreateInvoiceMutation: vi.fn() }));
vi.mock("@/features/invoices/InvoiceJournal", () => ({
  InvoiceJournal: () => <p>journal stub</p>,
}));

describe("HomePage service availability", () => {
  beforeEach(() => {
    vi.mocked(useCreateInvoiceMutation).mockReturnValue([vi.fn(), { isLoading: false }] as never);
  });

  it("shows no banner and an enabled form while the service is healthy", () => {
    vi.mocked(useIsServiceUnavailable).mockReturnValue(false);
    render(<HomePage />);

    expect(screen.queryByText(/Сервис недоступен/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать инвойс" })).toBeEnabled();
  });

  it("shows the banner and disables the form, but keeps the journal, when the service is down", () => {
    vi.mocked(useIsServiceUnavailable).mockReturnValue(true);
    render(<HomePage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Сервис недоступен");
    expect(screen.getByRole("button", { name: "Создать инвойс" })).toBeDisabled();
    expect(screen.getByText("journal stub")).toBeInTheDocument();
  });
});
