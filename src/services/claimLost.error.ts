import type { InvoiceStatus } from "@/types/invoice.types";

export class ClaimLostError extends Error {
  constructor(
    readonly invoiceId: string,
    readonly stage: "pdf" | "email",
    readonly currentStatus: InvoiceStatus | undefined,
  ) {
    super(
      `Could not claim invoice ${invoiceId} for ${stage} processing: it is ${currentStatus ?? "missing"} and another executor holds a live claim or the invoice is not ready yet`,
    );
    this.name = "ClaimLostError";
  }
}
