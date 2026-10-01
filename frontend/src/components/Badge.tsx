import type { InvoiceStatus } from "@/types/api";

const STATUS_META: Record<InvoiceStatus, { label: string; className: string }> = {
  PENDING: { label: "В очереди", className: "bg-border/60 text-ink-muted" },
  PDF_RENDERING: { label: "Готовим PDF", className: "bg-accent-soft text-accent-strong" },
  PDF_READY: { label: "PDF готов, отправляем", className: "bg-warning-soft text-warning" },
  EMAIL_SENDING: { label: "Отправляем письмо", className: "bg-accent-soft text-accent-strong" },
  SENT: { label: "Отправлено", className: "bg-success-soft text-success" },
  FAILED: { label: "Ошибка", className: "bg-danger-soft text-danger" },
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}
