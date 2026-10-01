import { useState } from "react";
import { ErrorBanner } from "@/components/ErrorBanner";
import { CreateInvoiceForm } from "@/features/invoices/CreateInvoiceForm";
import { InvoiceJournal } from "@/features/invoices/InvoiceJournal";
import { useIsServiceUnavailable } from "@/services/healthApi";

export function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const serviceUnavailable = useIsServiceUnavailable();

  return (
    <div className="flex flex-col gap-8">
      {serviceUnavailable && (
        <ErrorBanner message="Сервис недоступен. Создание инвойсов временно отключено, журнал остаётся доступен для чтения." />
      )}
      <CreateInvoiceForm disabled={serviceUnavailable} onCreated={() => setRefreshKey((key) => key + 1)} />
      <section>
        <h2 className="mb-4 text-base font-semibold">Журнал инвойсов</h2>
        <InvoiceJournal refreshKey={refreshKey} />
      </section>
    </div>
  );
}
