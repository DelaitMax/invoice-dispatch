import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateInvoiceForm } from "@/features/invoices/CreateInvoiceForm";
import { useCreateInvoiceMutation } from "@/features/invoices/invoicesApi";
import { addJournalEntry } from "@/features/invoices/journal";

vi.mock("@/features/invoices/invoicesApi", () => ({
  useCreateInvoiceMutation: vi.fn(),
}));
vi.mock("@/features/invoices/journal", () => ({
  addJournalEntry: vi.fn(),
}));

const mockedUseCreateInvoiceMutation = vi.mocked(useCreateInvoiceMutation);
const mockedAddJournalEntry = vi.mocked(addJournalEntry);

const CREATED = { invoiceId: "inv-1", invoiceNumber: "INV-1", recipientEmail: "client@example.com" };

function mockCreate(unwrap: () => Promise<unknown> = () => Promise.resolve(CREATED), error?: unknown) {
  const trigger = vi.fn((_arg: unknown) => ({ unwrap }));
  mockedUseCreateInvoiceMutation.mockReturnValue([trigger, { isLoading: false, error }] as never);
  return trigger;
}

async function fillValidForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email получателя"), "client@example.com");
  await user.type(screen.getByLabelText("Описание позиции"), "Consulting");
  await user.type(screen.getByLabelText("Цена за штуку"), "10.50");
  return user;
}

describe("CreateInvoiceForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the request in minor units with a fresh idempotency key", async () => {
    const trigger = mockCreate();
    render(<CreateInvoiceForm onCreated={vi.fn()} />);
    const user = await fillValidForm();
    await user.click(screen.getByRole("button", { name: "Создать инвойс" }));

    expect(trigger).toHaveBeenCalledTimes(1);
    const request = trigger.mock.calls[0]?.[0] as { input: unknown; idempotencyKey: string };
    expect(request.input).toEqual({
      email: "client@example.com",
      currency: "USD",
      items: [{ description: "Consulting", quantity: 1, unitAmountMinor: 1050 }],
    });
    expect(request.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("records the invoice in the journal, notifies the parent and resets the form", async () => {
    mockCreate();
    const onCreated = vi.fn();
    render(<CreateInvoiceForm onCreated={onCreated} />);
    const user = await fillValidForm();
    await user.click(screen.getByRole("button", { name: "Создать инвойс" }));

    expect(mockedAddJournalEntry).toHaveBeenCalledWith(CREATED);
    expect(onCreated).toHaveBeenCalledWith("inv-1");
    expect(screen.getByLabelText("Email получателя")).toHaveValue("");
  });

  it("keeps the user's input and shows the server's message when creation fails", async () => {
    const error = { status: 404, data: { error: { code: "CLIENT_NOT_FOUND", message: "No client with this email" } } };
    mockCreate(() => Promise.reject(new Error("request failed")), error);
    const onCreated = vi.fn();
    render(<CreateInvoiceForm onCreated={onCreated} />);
    const user = await fillValidForm();
    await user.click(screen.getByRole("button", { name: "Создать инвойс" }));

    expect(screen.getByRole("alert")).toHaveTextContent("No client with this email");
    expect(onCreated).not.toHaveBeenCalled();
    expect(mockedAddJournalEntry).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email получателя")).toHaveValue("client@example.com");
  });

  it("does not create two invoices from a double submit", async () => {
    let resolve: (value: unknown) => void = () => {};
    const trigger = mockCreate(() => new Promise((r) => (resolve = r)));
    const { container } = render(<CreateInvoiceForm onCreated={vi.fn()} />);
    await fillValidForm();

    const form = container.querySelector("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);
    fireEvent.submit(form);
    resolve(CREATED);

    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it("adds and removes item rows within the limits", async () => {
    mockCreate();
    render(<CreateInvoiceForm onCreated={vi.fn()} />);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "Удалить позицию" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "+ Добавить позицию" }));
    expect(screen.getAllByLabelText("Описание позиции")).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "Удалить позицию" })[0] as HTMLElement);
    expect(screen.getAllByLabelText("Описание позиции")).toHaveLength(1);
  });

  it("disables every control while the service is unavailable", () => {
    mockCreate();
    render(<CreateInvoiceForm onCreated={vi.fn()} disabled />);

    expect(screen.getByLabelText("Email получателя")).toBeDisabled();
    expect(screen.getByLabelText("Описание позиции")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Создать инвойс" })).toBeDisabled();
  });

  it("does not submit while disabled, even if the form event is fired directly", () => {
    const trigger = mockCreate();
    const { container } = render(<CreateInvoiceForm onCreated={vi.fn()} disabled />);
    const form = container.querySelector("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    expect(trigger).not.toHaveBeenCalled();
  });
});
