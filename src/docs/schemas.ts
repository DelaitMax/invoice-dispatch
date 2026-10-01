import { z } from "zod";
import { ALLOWED_CURRENCIES } from "@/constants";
import { INVOICE_STATUSES } from "@/types/invoice.types";

export const errorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
    details: z.record(z.array(z.string())).optional(),
  }),
});

export const createInvoiceResponseSchema = z.object({
  invoiceId: z.string().uuid(),
  invoiceNumber: z.string(),
  status: z.enum(INVOICE_STATUSES),
  currency: z.enum(ALLOWED_CURRENCIES),
  totalMinor: z.number().int(),
  recipientEmail: z.string().email(),
  issuedAt: z.string().datetime(),
});

export const invoiceItemResponseSchema = z.object({
  position: z.number().int(),
  description: z.string(),
  quantity: z.number().int(),
  unitAmountMinor: z.number().int(),
  amountMinor: z.number().int(),
});

export const invoiceDetailResponseSchema = z.object({
  invoiceId: z.string().uuid(),
  invoiceNumber: z.string(),
  status: z.enum(INVOICE_STATUSES),
  currency: z.enum(ALLOWED_CURRENCIES),
  totalMinor: z.number().int(),
  recipientEmail: z.string().email(),
  client: z.object({
    firstName: z.string(),
    lastName: z.string(),
    company: z.object({ name: z.string(), address: z.string() }).nullable(),
  }),
  items: z.array(invoiceItemResponseSchema),
  issuedAt: z.string().datetime(),
  dueAt: z.string().datetime().nullable(),
  pdfGeneratedAt: z.string().datetime().nullable(),
  sentAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
});

export const retryInvoiceResponseSchema = z.object({
  invoiceId: z.string().uuid(),
  status: z.enum(INVOICE_STATUSES),
});

export const livenessResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

const componentStatusSchema = z.enum(["ok", "error"]);

export const readinessResponseSchema = z.object({
  status: componentStatusSchema,
  components: z.object({ database: componentStatusSchema, redis: componentStatusSchema }),
});
