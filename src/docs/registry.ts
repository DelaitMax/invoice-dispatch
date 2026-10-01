import { extendZodWithOpenApi, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import type { ResponseConfig } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { createInvoiceBodySchema } from "@/schemas/invoices.schema";
import {
  createInvoiceResponseSchema,
  errorResponseSchema,
  invoiceDetailResponseSchema,
  livenessResponseSchema,
  readinessResponseSchema,
  retryInvoiceResponseSchema,
} from "./schemas";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

const apiKeyAuth = registry.registerComponent("securitySchemes", "apiKey", {
  type: "apiKey",
  in: "header",
  name: "X-API-Key",
  description: "Only enforced when the server has API_KEY configured.",
});

const AUTH = [{ [apiKeyAuth.name]: [] }];

function json(description: string, schema: z.ZodTypeAny): ResponseConfig {
  return { description, content: { "application/json": { schema } } };
}

function errorJson(description: string): ResponseConfig {
  return { description, content: { "application/json": { schema: errorResponseSchema } } };
}

const VALIDATION_ERROR = errorJson("Request validation failed (VALIDATION_ERROR)");
const UNAUTHORIZED = errorJson("Missing or invalid X-API-Key (UNAUTHORIZED)");
const RATE_LIMITED = errorJson("Too many requests (RATE_LIMITED)");

const invoiceIdParamSchema = z.object({
  id: z.string().uuid().openapi({ description: "Invoice id", example: "5b1f1f1a-2c2c-4a2a-9c1a-8a1e6f2b9a10" }),
});

const idempotencyKeyHeaderSchema = z.object({
  "Idempotency-Key": z
    .string()
    .optional()
    .openapi({ description: "Replay the same key + body to get the same invoice back idempotently." }),
});

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Liveness probe — never touches a dependency",
  responses: { 200: json("Process is up", livenessResponseSchema) },
});

registry.registerPath({
  method: "get",
  path: "/health/ready",
  tags: ["Health"],
  summary: "Readiness probe — Postgres SELECT 1 + Redis PING",
  responses: {
    200: json("Ready", readinessResponseSchema),
    503: json("At least one dependency is down", readinessResponseSchema),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/invoices",
  tags: ["Invoices"],
  summary: "Create an invoice for an existing client and enqueue PDF rendering + email delivery",
  security: AUTH,
  request: {
    headers: idempotencyKeyHeaderSchema,
    body: { content: { "application/json": { schema: createInvoiceBodySchema } } },
  },
  responses: {
    202: json("Accepted for processing", createInvoiceResponseSchema),
    200: json("Idempotent replay of a previous request", createInvoiceResponseSchema),
    400: VALIDATION_ERROR,
    401: UNAUTHORIZED,
    404: errorJson("The recipient email doesn't match a registered client (CLIENT_NOT_FOUND)"),
    409: errorJson("Idempotency-Key reused with a different body (IDEMPOTENCY_KEY_CONFLICT)"),
    429: RATE_LIMITED,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/invoices/{id}",
  tags: ["Invoices"],
  summary: "Get an invoice, its billing snapshot, and its current status",
  security: AUTH,
  request: { params: invoiceIdParamSchema },
  responses: {
    200: json("Invoice detail", invoiceDetailResponseSchema),
    400: VALIDATION_ERROR,
    401: UNAUTHORIZED,
    404: errorJson("Invoice not found (INVOICE_NOT_FOUND)"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/invoices/{id}/pdf",
  tags: ["Invoices"],
  summary: "Download the rendered invoice PDF",
  security: AUTH,
  request: { params: invoiceIdParamSchema },
  responses: {
    200: {
      description: "The PDF file",
      content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
    },
    400: VALIDATION_ERROR,
    401: UNAUTHORIZED,
    404: errorJson("Invoice not found (INVOICE_NOT_FOUND)"),
    409: errorJson("The PDF hasn't been rendered yet (PDF_NOT_READY)"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/invoices/{id}/retry",
  tags: ["Invoices"],
  summary: "Retry a FAILED invoice — resets it to PENDING and re-enqueues rendering",
  security: AUTH,
  request: { params: invoiceIdParamSchema },
  responses: {
    202: json("Retry accepted", retryInvoiceResponseSchema),
    400: VALIDATION_ERROR,
    401: UNAUTHORIZED,
    404: errorJson("Invoice not found (INVOICE_NOT_FOUND)"),
    409: errorJson("Invoice is not in a retryable (FAILED) state (INVOICE_NOT_RETRYABLE)"),
  },
});
