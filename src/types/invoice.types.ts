export const INVOICE_STATUSES = ["PENDING", "PDF_RENDERING", "PDF_READY", "EMAIL_SENDING", "SENT", "FAILED"] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const IN_FLIGHT_STATUSES = ["PDF_RENDERING", "EMAIL_SENDING"] as const satisfies readonly InvoiceStatus[];

export function isInFlightStatus(status: InvoiceStatus): boolean {
  return (IN_FLIGHT_STATUSES as readonly InvoiceStatus[]).includes(status);
}

export interface BillingSnapshotCompany {
  readonly name: string;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
  readonly taxId: string | null;
}

export interface BillingSnapshotClient {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly company: BillingSnapshotCompany | null;
}

export interface BillingSnapshotSenderAddress {
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly postalCode: string | null;
  readonly country: string | null;
}

export interface BillingSnapshotSender {
  readonly brand: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly address: BillingSnapshotSenderAddress;
}

export interface BillingSnapshot {
  readonly client: BillingSnapshotClient;
  readonly sender: BillingSnapshotSender;
  readonly currency: string;
  readonly issuedAt: string;
}

export interface InvoiceItemView {
  readonly position: number;
  readonly description: string;
  readonly quantity: number;
  readonly unitAmountMinor: number;
  readonly amountMinor: number;
}
