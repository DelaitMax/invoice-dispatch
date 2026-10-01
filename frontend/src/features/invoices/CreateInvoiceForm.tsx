import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Input } from "@/components/Input";
import { useCreateInvoiceMutation } from "@/features/invoices/invoicesApi";
import { addJournalEntry } from "@/features/invoices/journal";
import { formatMoney, majorToMinor } from "@/features/invoices/money";
import { getApiErrorMessage } from "@/services/apiError";
import {
  ALLOWED_CURRENCIES,
  MAX_EMAIL_LENGTH,
  MAX_INVOICE_ITEMS,
  MAX_ITEM_DESCRIPTION_LENGTH,
  MAX_ITEM_QUANTITY,
  MAX_NOTES_LENGTH,
  MIN_ITEM_QUANTITY,
  type Currency,
} from "@/types/api";

interface ItemRow {
  description: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_ITEM: ItemRow = { description: "", quantity: "1", unitPrice: "" };

interface CreateInvoiceFormProps {
  onCreated: (invoiceId: string) => void;
  disabled?: boolean;
}

export function CreateInvoiceForm({ onCreated, disabled = false }: CreateInvoiceFormProps) {
  const [createInvoice, { isLoading, error }] = useCreateInvoiceMutation();

  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [notes, setNotes] = useState("");
  const isSubmittingRef = useRef(false);

  const estimatedTotalMinor = items.reduce((sum, item) => {
    const quantity = Number.parseInt(item.quantity, 10) || 0;
    return sum + majorToMinor(item.unitPrice || "0") * quantity;
  }, 0);

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((current) => (current.length >= MAX_INVOICE_ITEMS ? current : [...current, { ...EMPTY_ITEM }]));
  }

  function removeItem(index: number) {
    setItems((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (disabled || isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    try {
      const created = await createInvoice({
        input: {
          email,
          currency,
          items: items.map((item) => ({
            description: item.description,
            quantity: Number.parseInt(item.quantity, 10),
            unitAmountMinor: majorToMinor(item.unitPrice),
          })),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        idempotencyKey: crypto.randomUUID(),
      }).unwrap();

      addJournalEntry({
        invoiceId: created.invoiceId,
        invoiceNumber: created.invoiceNumber,
        recipientEmail: created.recipientEmail,
      });
      setEmail("");
      setItems([{ ...EMPTY_ITEM }]);
      setNotes("");
      onCreated(created.invoiceId);
    } catch {
    } finally {
      isSubmittingRef.current = false;
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold">Новый инвойс</h2>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
            <Input
              label="Email получателя"
              type="email"
              required
              maxLength={MAX_EMAIL_LENGTH}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="currency" className="text-sm font-medium text-ink-muted">
                Валюта
              </label>
              <select
                id="currency"
                className="rounded-md border border-border px-3 py-2 text-sm"
                value={currency}
                onChange={(event) => setCurrency(event.target.value as Currency)}
              >
                {ALLOWED_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink-muted">Позиции</span>
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-[1fr_5rem_6rem_auto] items-end gap-2">
                <Input
                  label={index === 0 ? "Описание" : ""}
                  aria-label="Описание позиции"
                  required
                  maxLength={MAX_ITEM_DESCRIPTION_LENGTH}
                  value={item.description}
                  onChange={(event) => updateItem(index, { description: event.target.value })}
                />
                <Input
                  label={index === 0 ? "Кол-во" : ""}
                  aria-label="Количество"
                  type="number"
                  required
                  min={MIN_ITEM_QUANTITY}
                  max={MAX_ITEM_QUANTITY}
                  value={item.quantity}
                  onChange={(event) => updateItem(index, { quantity: event.target.value })}
                />
                <Input
                  label={index === 0 ? "Цена" : ""}
                  aria-label="Цена за штуку"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(event) => updateItem(index, { unitPrice: event.target.value })}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={items.length <= 1}
                  onClick={() => removeItem(index)}
                  aria-label="Удалить позицию"
                >
                  ×
                </Button>
              </div>
            ))}
            <div>
              <Button type="button" variant="secondary" disabled={items.length >= MAX_INVOICE_ITEMS} onClick={addItem}>
                + Добавить позицию
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="notes" className="text-sm font-medium text-ink-muted">
              Заметка (необязательно)
            </label>
            <textarea
              id="notes"
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              rows={2}
              maxLength={MAX_NOTES_LENGTH}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <p className="text-sm text-ink-muted">
            Предварительный итог:{" "}
            <span className="font-medium text-ink">{formatMoney(estimatedTotalMinor, currency)}</span>
            {" — "}точную сумму считает сервер.
          </p>

          {error && <ErrorBanner message={getApiErrorMessage(error, "Не удалось создать инвойс")} />}

          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Создаём…" : "Создать инвойс"}
          </Button>
        </fieldset>
      </form>
    </Card>
  );
}
