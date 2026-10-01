import { readFileSync } from "node:fs";
import { join } from "node:path";
import Handlebars from "handlebars";
import type { BillingSnapshot, InvoiceItemView } from "@/types/invoice.types";
import { formatMinor } from "@/utils/money";

const TEMPLATE_PATH = join(__dirname, "templates", "invoice.hbs");
const renderTemplate = Handlebars.compile(readFileSync(TEMPLATE_PATH, "utf8"));

const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" });

function formatDisplayDate(date: Date): string {
  return DISPLAY_DATE_FORMATTER.format(date);
}

export interface RenderInvoiceHtmlInput {
  readonly snapshot: BillingSnapshot;
  readonly items: ReadonlyArray<InvoiceItemView>;
  readonly invoiceNumber: string;
  readonly issuedAt: Date;
  readonly dueAt: Date | null;
  readonly totalMinor: number;
  readonly notes: string | null;
}

export function renderInvoiceHtml(input: RenderInvoiceHtmlInput): string {
  const { snapshot, items, invoiceNumber, issuedAt, dueAt, totalMinor, notes } = input;

  return renderTemplate({
    invoiceNumber,
    currency: snapshot.currency,
    issuedAtFormatted: formatDisplayDate(issuedAt),
    dueAtFormatted: dueAt ? formatDisplayDate(dueAt) : null,
    sender: snapshot.sender,
    client: snapshot.client,
    items: items.map((item) => ({
      position: item.position,
      description: item.description,
      quantity: item.quantity,
      unitAmountFormatted: formatMinor(item.unitAmountMinor, snapshot.currency),
      amountFormatted: formatMinor(item.amountMinor, snapshot.currency),
    })),
    totalFormatted: formatMinor(totalMinor, snapshot.currency),
    notes,
  });
}
