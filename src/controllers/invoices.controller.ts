import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { env } from "@/config/env";
import { senderProfile } from "@/config/sender";
import { db } from "@/db/client";
import { pdfQueue } from "@/queue/pdfQueue";
import { findClientByEmailWithCompany } from "@/repositories/clients.repository";
import { findInvoiceDocument } from "@/repositories/invoiceDocuments.repository";
import { insertInvoiceEvent } from "@/repositories/invoiceEvents.repository";
import { insertInvoiceItems, listInvoiceItems } from "@/repositories/invoiceItems.repository";
import { allocateInvoiceNumber } from "@/repositories/invoiceNumbers.repository";
import { insertInvoiceRequest, updateInvoiceRequestOutcome } from "@/repositories/invoiceRequests.repository";
import { findInvoiceByIdempotencyKey, findInvoiceById, insertInvoice } from "@/repositories/invoices.repository";
import { createInvoiceBodySchema } from "@/schemas/invoices.schema";
import { createInvoice, type IntakeDeps } from "@/services/invoiceIntake.service";
import { transition } from "@/services/invoiceStatus.service";
import type { BillingSnapshotCompany } from "@/types/invoice.types";
import { AppError } from "@/utils/AppError";
import { getClientIp } from "@/utils/getClientIp";
import { logger } from "@/utils/logger";

const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
const USER_AGENT_HEADER = "user-agent";

const intakeDeps: IntakeDeps = {
  db,
  clients: { findByEmailWithCompany: findClientByEmailWithCompany },
  invoices: { findByIdempotencyKey: findInvoiceByIdempotencyKey, insert: insertInvoice },
  invoiceItems: { insertMany: insertInvoiceItems },
  invoiceNumbers: { allocate: allocateInvoiceNumber },
  invoiceEvents: { insert: insertInvoiceEvent },
  requests: { insert: insertInvoiceRequest, markOutcome: updateInvoiceRequestOutcome },
  pdfQueue,
  sender: senderProfile,
  invoiceDueDays: env.INVOICE_DUE_DAYS,
  clock: () => new Date(),
  logger,
};

function getHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim().length > 0 ? first.trim() : undefined;
}

export async function createInvoiceHandler(req: Request, res: Response): Promise<void> {
  const body = createInvoiceBodySchema.parse(req.body);
  const idempotencyKey = getHeader(req, IDEMPOTENCY_KEY_HEADER);

  const result = await createInvoice(
    {
      email: body.email,
      currency: body.currency,
      items: body.items,
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      audit: {
        rawBody: req.body,
        ip: getClientIp(req),
        userAgent: getHeader(req, USER_AGENT_HEADER) ?? null,
        requestId: req.requestId ?? "unknown",
      },
    },
    intakeDeps,
  );

  res.status(result.duplicate ? StatusCodes.OK : StatusCodes.ACCEPTED).json({
    invoiceId: result.invoiceId,
    invoiceNumber: result.invoiceNumber,
    status: result.status,
    currency: result.currency,
    totalMinor: result.totalMinor,
    recipientEmail: result.recipientEmail,
    issuedAt: result.issuedAt.toISOString(),
  });
}

const invoiceIdParamsSchema = z.object({ id: z.string().uuid() });

function formatCompanyAddress(company: BillingSnapshotCompany): string {
  return [company.addressLine1, company.addressLine2, company.city, company.postalCode, company.country]
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .join(", ");
}

export async function getInvoiceHandler(req: Request, res: Response): Promise<void> {
  const { id } = invoiceIdParamsSchema.parse(req.params);

  const invoice = await findInvoiceById(db, id);

  if (!invoice) {
    throw AppError.notFound(`Invoice ${id} not found`, "INVOICE_NOT_FOUND");
  }

  const items = await listInvoiceItems(db, invoice.id);
  const { client } = invoice.billingSnapshot;

  res.status(StatusCodes.OK).json({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    currency: invoice.currency,
    totalMinor: invoice.totalMinor,
    recipientEmail: invoice.recipientEmail,
    client: {
      firstName: client.firstName,
      lastName: client.lastName,
      company: client.company ? { name: client.company.name, address: formatCompanyAddress(client.company) } : null,
    },
    items: items.map((item) => ({
      position: item.position,
      description: item.description,
      quantity: item.quantity,
      unitAmountMinor: item.unitAmountMinor,
      amountMinor: item.amountMinor,
    })),
    issuedAt: invoice.issuedAt.toISOString(),
    dueAt: invoice.dueAt ? invoice.dueAt.toISOString() : null,
    pdfGeneratedAt: invoice.pdfGeneratedAt ? invoice.pdfGeneratedAt.toISOString() : null,
    sentAt: invoice.sentAt ? invoice.sentAt.toISOString() : null,
    lastError: invoice.lastError,
  });
}

export async function getInvoicePdfHandler(req: Request, res: Response): Promise<void> {
  const { id } = invoiceIdParamsSchema.parse(req.params);

  const invoice = await findInvoiceById(db, id);

  if (!invoice) {
    throw AppError.notFound(`Invoice ${id} not found`, "INVOICE_NOT_FOUND");
  }

  const document = await findInvoiceDocument(db, id);

  if (!document) {
    throw AppError.conflict(`PDF for invoice ${id} is not ready yet`, "PDF_NOT_READY");
  }

  res
    .status(StatusCodes.OK)
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`)
    .send(document.content);
}

export async function retryInvoiceHandler(req: Request, res: Response): Promise<void> {
  const { id } = invoiceIdParamsSchema.parse(req.params);

  const invoice = await findInvoiceById(db, id);

  if (!invoice) {
    throw AppError.notFound(`Invoice ${id} not found`, "INVOICE_NOT_FOUND");
  }

  let updated;
  try {
    updated = await transition(db, { logger }, id, ["FAILED"], "PENDING", { lastError: null });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === StatusCodes.CONFLICT) {
      throw AppError.conflict(`Invoice ${id} is not in a retryable state`, "INVOICE_NOT_RETRYABLE");
    }
    throw err;
  }

  try {
    await pdfQueue.add("render", { invoiceId: id }, { jobId: `pdf-${id}` });
  } catch (err) {
    logger.error("Failed to enqueue PDF render job on retry; the sweeper will pick this invoice up", {
      invoiceId: id,
      error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: err },
    });
  }

  res.status(StatusCodes.ACCEPTED).json({ invoiceId: updated.id, status: updated.status });
}
