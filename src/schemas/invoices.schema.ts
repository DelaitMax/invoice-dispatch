import { z } from "zod";
import { env } from "@/config/env";
import {
  ALLOWED_CURRENCIES,
  MAX_AMOUNT_MINOR,
  MAX_EMAIL_LENGTH,
  MAX_INVOICE_ITEMS,
  MAX_ITEM_DESCRIPTION_LENGTH,
  MAX_ITEM_QUANTITY,
  MAX_NOTES_LENGTH,
  MIN_ITEM_QUANTITY,
  MIN_UNIT_AMOUNT_MINOR,
} from "@/constants";

export const invoiceItemInputSchema = z
  .object({
    description: z.string().trim().min(1).max(MAX_ITEM_DESCRIPTION_LENGTH),
    quantity: z.number().int().min(MIN_ITEM_QUANTITY).max(MAX_ITEM_QUANTITY).default(1),
    unitAmountMinor: z.number().int().min(MIN_UNIT_AMOUNT_MINOR).max(MAX_AMOUNT_MINOR),
  })
  .strict();

export const createInvoiceBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().max(MAX_EMAIL_LENGTH).email(),
    currency: z.string().trim().toUpperCase().pipe(z.enum(ALLOWED_CURRENCIES)).default(env.INVOICE_CURRENCY_DEFAULT),
    items: z.array(invoiceItemInputSchema).min(1).max(MAX_INVOICE_ITEMS),
    notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  })
  .strict();

export type CreateInvoiceBody = z.infer<typeof createInvoiceBodySchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;
