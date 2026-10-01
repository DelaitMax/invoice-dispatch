import { useState } from "react";
import { CreateInvoiceForm } from "@/features/invoices/CreateInvoiceForm";
import { InvoiceJournal } from "@/features/invoices/InvoiceJournal";

export function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-8">
      <CreateInvoiceForm onCreated={() => setRefreshKey((key) => key + 1)} />
      <section>
        <h2 className="mb-4 text-base font-semibold">Журнал инвойсов</h2>
        <InvoiceJournal refreshKey={refreshKey} />
      </section>
    </div>
  );
}
