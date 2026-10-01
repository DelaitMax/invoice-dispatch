import { useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Input } from "@/components/Input";
import { Spinner } from "@/components/Spinner";
import { StatusBadge } from "@/components/Badge";
import { useGetCurrentUserQuery } from "@/features/auth/authApi";
import { invoicePdfUrl, isTerminalStatus, useGetInvoiceQuery, useLazyGetInvoiceQuery, useRetryInvoiceMutation } from "@/features/invoices/invoicesApi";
import { addJournalEntry, listJournalEntries, removeJournalEntry, type JournalEntry } from "@/features/invoices/journal";
import { formatMoney } from "@/features/invoices/money";
import { getApiErrorCode, getApiErrorMessage } from "@/services/apiError";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function AddByIdForm({ onAdded }: { onAdded: () => void }) {
  const [invoiceId, setInvoiceId] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [triggerLookup, { isFetching }] = useLazyGetInvoiceQuery();

  async function handleSubmit() {
    const trimmed = invoiceId.trim();
    if (!UUID_PATTERN.test(trimmed)) {
      setValidationError("Это не похоже на ID инвойса (UUID)");
      return;
    }
    setValidationError(null);

    const result = await triggerLookup(trimmed);
    if (result.data) {
      addJournalEntry({
        invoiceId: result.data.invoiceId,
        invoiceNumber: result.data.invoiceNumber,
        recipientEmail: result.data.recipientEmail,
      });
      setInvoiceId("");
      onAdded();
    } else {
      setValidationError(getApiErrorMessage(result.error, "Инвойс с таким ID не найден"));
    }
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Input
          label="Добавить по ID"
          placeholder="00000000-0000-0000-0000-000000000000"
          value={invoiceId}
          onChange={(event) => setInvoiceId(event.target.value)}
          error={validationError ?? undefined}
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={isFetching || !invoiceId.trim()}
        onClick={() => void handleSubmit()}
      >
        Добавить
      </Button>
    </div>
  );
}

function JournalRow({ entry, onRemoved }: { entry: JournalEntry; onRemoved: () => void }) {
  const { data: currentUser } = useGetCurrentUserQuery();
  const [isTerminal, setIsTerminal] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { data, error } = useGetInvoiceQuery(entry.invoiceId, { pollingInterval: isTerminal ? 0 : 2000 });
  const [retryInvoice, { isLoading: isRetrying }] = useRetryInvoiceMutation();

  if (data && isTerminalStatus(data.status) !== isTerminal) {
    setIsTerminal(isTerminalStatus(data.status));
  }

  const notFound = getApiErrorCode(error) === "INVOICE_NOT_FOUND";
  const canDownload = data ? ["PDF_READY", "EMAIL_SENDING", "SENT"].includes(data.status) : false;
  const canRetry = data?.status === "FAILED" && currentUser?.role === "admin";

  function handleRemove() {
    removeJournalEntry(entry.invoiceId);
    onRemoved();
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="flex flex-1 flex-col items-start text-left"
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="text-sm font-medium">{entry.invoiceNumber}</span>
          <span className="text-xs text-ink-muted">{entry.recipientEmail}</span>
        </button>

        {data ? (
          <>
            <span className="text-sm text-ink-muted">{formatMoney(data.totalMinor, data.currency)}</span>
            <StatusBadge status={data.status} />
          </>
        ) : notFound ? (
          <span className="text-xs text-danger">Не найден на сервере</span>
        ) : (
          <Spinner label="" />
        )}

        <div className="flex items-center gap-2">
          {canDownload && (
            <a href={invoicePdfUrl(entry.invoiceId)} className="text-sm text-accent hover:underline">
              Скачать PDF
            </a>
          )}
          {canRetry && (
            <Button variant="secondary" disabled={isRetrying} onClick={() => void retryInvoice(entry.invoiceId)}>
              {isRetrying ? "Повторяем…" : "Повторить"}
            </Button>
          )}
          <Button variant="secondary" onClick={handleRemove}>
            Убрать
          </Button>
        </div>
      </div>

      {expanded && data && (
        <div className="mt-4 border-t border-border pt-4 text-sm">
          <p className="mb-2 text-ink-muted">
            {data.client.firstName} {data.client.lastName}
            {data.client.company && ` · ${data.client.company.name}, ${data.client.company.address}`}
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-ink-muted">
                <th className="pb-1 font-normal">Описание</th>
                <th className="pb-1 font-normal">Кол-во</th>
                <th className="pb-1 font-normal text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.position}>
                  <td className="py-0.5">{item.description}</td>
                  <td className="py-0.5">{item.quantity}</td>
                  <td className="py-0.5 text-right">{formatMoney(item.amountMinor, data.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.lastError && <ErrorBanner message={data.lastError} />}
        </div>
      )}
    </Card>
  );
}

export function InvoiceJournal({ refreshKey }: { refreshKey: number }) {
  const [version, setVersion] = useState(0);
  const entries = useMemo(() => listJournalEntries(), [refreshKey, version]);

  function reload() {
    setVersion((value) => value + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <AddByIdForm onAdded={reload} />
      </Card>

      {entries.length === 0 ? (
        <p className="text-sm text-ink-muted">Пока нет инвойсов в журнале на этом устройстве.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <JournalRow key={entry.invoiceId} entry={entry} onRemoved={reload} />
          ))}
        </div>
      )}
    </div>
  );
}
