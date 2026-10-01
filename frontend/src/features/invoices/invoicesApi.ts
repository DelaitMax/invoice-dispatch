import { api } from "@/services/api";
import { TERMINAL_INVOICE_STATUSES, type InvoiceStatus } from "@/types/api";
import type { paths } from "@/types/api.generated";

export type CreateInvoiceInput = NonNullable<
  paths["/api/invoices"]["post"]["requestBody"]
>["content"]["application/json"];
export type CreateInvoiceResult = paths["/api/invoices"]["post"]["responses"][202]["content"]["application/json"];
export type InvoiceDetail = paths["/api/invoices/{id}"]["get"]["responses"][200]["content"]["application/json"];
export type InvoiceItem = InvoiceDetail["items"][number];
type RetryResult = paths["/api/invoices/{id}/retry"]["post"]["responses"][202]["content"]["application/json"];

const invoicesApi = api.injectEndpoints({
  endpoints: (build) => ({
    createInvoice: build.mutation<CreateInvoiceResult, { input: CreateInvoiceInput; idempotencyKey: string }>({
      query: ({ input, idempotencyKey }) => ({
        url: "/api/invoices",
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": idempotencyKey },
      }),
    }),
    getInvoice: build.query<InvoiceDetail, string>({
      query: (invoiceId) => ({ url: `/api/invoices/${invoiceId}` }),
      providesTags: (_result, _error, invoiceId) => [{ type: "Invoice", id: invoiceId }],
    }),
    retryInvoice: build.mutation<RetryResult, string>({
      query: (invoiceId) => ({ url: `/api/invoices/${invoiceId}/retry`, method: "POST" }),
      invalidatesTags: (_result, _error, invoiceId) => [{ type: "Invoice", id: invoiceId }],
    }),
  }),
});

export const { useCreateInvoiceMutation, useGetInvoiceQuery, useLazyGetInvoiceQuery, useRetryInvoiceMutation } =
  invoicesApi;

export function isTerminalStatus(status: InvoiceStatus): boolean {
  return TERMINAL_INVOICE_STATUSES.has(status);
}

export function invoicePdfUrl(invoiceId: string): string {
  return `/api/invoices/${invoiceId}/pdf`;
}
