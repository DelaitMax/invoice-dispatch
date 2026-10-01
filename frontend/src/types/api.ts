import type { paths } from "@/types/api.generated";

export type ApiErrorBody = paths["/auth/login"]["post"]["responses"][401]["content"]["application/json"];
export type AuthUser = paths["/auth/me"]["get"]["responses"][200]["content"]["application/json"];
export type UserRole = AuthUser["role"];

export const MAX_INVOICE_ITEMS = 50;
export const MAX_ITEM_DESCRIPTION_LENGTH = 500;
export const MAX_NOTES_LENGTH = 2000;
export const MIN_ITEM_QUANTITY = 1;
export const MAX_ITEM_QUANTITY = 10_000;
export const MAX_EMAIL_LENGTH = 254;

export const ALLOWED_CURRENCIES = ["USD", "EUR", "GBP"] as const;
export type Currency = (typeof ALLOWED_CURRENCIES)[number];

export const INVOICE_STATUSES = ["PENDING", "PDF_RENDERING", "PDF_READY", "EMAIL_SENDING", "SENT", "FAILED"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const TERMINAL_INVOICE_STATUSES: ReadonlySet<InvoiceStatus> = new Set(["SENT", "FAILED"]);
