import type { Queue } from "bullmq";
import type { SenderProfile } from "@/config/sender";
import type { Database } from "@/db/client";
import type { ClientWithCompany, findClientByEmailWithCompany } from "@/repositories/clients.repository";
import type { insertInvoiceEvent } from "@/repositories/invoiceEvents.repository";
import type { insertInvoiceItems } from "@/repositories/invoiceItems.repository";
import type { allocateInvoiceNumber } from "@/repositories/invoiceNumbers.repository";
import type { insertInvoiceRequest, updateInvoiceRequestOutcome } from "@/repositories/invoiceRequests.repository";
import { type InvoiceRow, findInvoiceByIdempotencyKey, insertInvoice } from "@/repositories/invoices.repository";
import type { BillingSnapshot, InvoiceStatus } from "@/types/invoice.types";
import type { PdfJobData } from "@/types/queue.types";
import { AppError } from "@/utils/AppError";
import { canonicalJson, sha256Hex } from "@/utils/hash";
import type { Logger } from "@/utils/logger";
import { computeLineAmountMinor, sumMinor } from "@/utils/money";

export interface CreateInvoiceItemInput {
  readonly description: string;
  readonly quantity: number;
  readonly unitAmountMinor: number;
}

export interface CreateInvoiceAudit {
  readonly rawBody: unknown;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly requestId: string;
}

export interface CreateInvoiceInput {
  readonly userId: string;
  readonly email: string;
  readonly currency: string;
  readonly notes?: string;
  readonly items: ReadonlyArray<CreateInvoiceItemInput>;
  readonly idempotencyKey?: string;
  readonly audit: CreateInvoiceAudit;
}

export interface CreateInvoiceResult {
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly status: InvoiceStatus;
  readonly currency: string;
  readonly totalMinor: number;
  readonly recipientEmail: string;
  readonly issuedAt: Date;
  readonly duplicate: boolean;
}

export interface IntakeDeps {
  readonly db: Database;
  readonly clients: {
    readonly findByEmailWithCompany: typeof findClientByEmailWithCompany;
  };
  readonly invoices: {
    readonly findByIdempotencyKey: typeof findInvoiceByIdempotencyKey;
    readonly insert: typeof insertInvoice;
  };
  readonly invoiceItems: {
    readonly insertMany: typeof insertInvoiceItems;
  };
  readonly invoiceNumbers: {
    readonly allocate: typeof allocateInvoiceNumber;
  };
  readonly invoiceEvents: {
    readonly insert: typeof insertInvoiceEvent;
  };
  readonly requests: {
    readonly insert: typeof insertInvoiceRequest;
    readonly markOutcome: typeof updateInvoiceRequestOutcome;
  };
  readonly pdfQueue: Pick<Queue<PdfJobData>, "add">;
  readonly sender: SenderProfile;
  readonly invoiceDueDays: number;
  readonly clock: () => Date;
  readonly logger: Logger;
}

type HashableFields = Pick<CreateInvoiceInput, "email" | "currency" | "notes" | "items">;

function computeRequestHash(input: HashableFields): string {
  return sha256Hex(
    canonicalJson({ email: input.email, currency: input.currency, notes: input.notes ?? null, items: input.items }),
  );
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function buildBillingSnapshot(
  client: ClientWithCompany,
  sender: SenderProfile,
  currency: string,
  issuedAt: Date,
): BillingSnapshot {
  return {
    client: {
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      company: client.company
        ? {
            name: client.company.name,
            addressLine1: client.company.addressLine1,
            addressLine2: client.company.addressLine2,
            city: client.company.city,
            postalCode: client.company.postalCode,
            country: client.company.country,
            taxId: client.company.taxId,
          }
        : null,
    },
    sender: {
      brand: sender.brand,
      name: sender.name,
      email: sender.email,
      phone: sender.phone ?? null,
      address: {
        line1: sender.address.line1,
        line2: sender.address.line2 ?? null,
        city: sender.address.city,
        postalCode: sender.address.postalCode ?? null,
        country: sender.address.country ?? null,
      },
    },
    currency,
    issuedAt: issuedAt.toISOString(),
  };
}

function toResult(invoice: InvoiceRow, duplicate: boolean): CreateInvoiceResult {
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    currency: invoice.currency,
    totalMinor: invoice.totalMinor,
    recipientEmail: invoice.recipientEmail,
    issuedAt: invoice.issuedAt,
    duplicate,
  };
}

function scopeIdempotencyKey(userId: string, key: string | undefined): string | undefined {
  return key === undefined ? undefined : `${userId}:${key}`;
}

export async function createInvoice(rawInput: CreateInvoiceInput, deps: IntakeDeps): Promise<CreateInvoiceResult> {
  const input = { ...rawInput, idempotencyKey: scopeIdempotencyKey(rawInput.userId, rawInput.idempotencyKey) };
  const requestHash = computeRequestHash(input);

  const requestRow = await deps.requests.insert(deps.db, {
    recipientEmail: input.email,
    rawBody: input.audit.rawBody,
    idempotencyKey: input.idempotencyKey ?? null,
    clientIp: input.audit.ip,
    userAgent: input.audit.userAgent,
    requestId: input.audit.requestId,
    userId: input.userId,
  });

  if (input.idempotencyKey) {
    const existing = await deps.invoices.findByIdempotencyKey(deps.db, input.idempotencyKey);

    if (existing) {
      await deps.requests.markOutcome(deps.db, requestRow.id, "DUPLICATE", existing.id);

      if (existing.requestHash === requestHash) {
        deps.logger.info("Idempotent replay of invoice creation", {
          invoiceId: existing.id,
          requestId: input.audit.requestId,
          userId: input.userId,
        });
        return toResult(existing, true);
      }

      throw AppError.conflict(
        `Idempotency-Key "${rawInput.idempotencyKey}" was already used with a different request body`,
        "IDEMPOTENCY_KEY_CONFLICT",
      );
    }
  }

  const client = await deps.clients.findByEmailWithCompany(deps.db, input.email);

  if (!client) {
    await deps.requests.markOutcome(deps.db, requestRow.id, "CLIENT_NOT_FOUND");
    throw AppError.notFound(`Client with email "${input.email}" is not registered`, "CLIENT_NOT_FOUND");
  }

  const totalMinor = sumMinor(input.items);
  const issuedAt = deps.clock();
  const dueAt = addDays(issuedAt, deps.invoiceDueDays);
  const billingSnapshot = buildBillingSnapshot(client, deps.sender, input.currency, issuedAt);

  const invoice = await deps.db.transaction(async (tx) => {
    const invoiceNumber = await deps.invoiceNumbers.allocate(tx, issuedAt.getUTCFullYear());

    const insertedInvoice = await deps.invoices.insert(tx, {
      invoiceNumber,
      clientId: client.id,
      companyId: client.company?.id ?? null,
      recipientEmail: client.email,
      currency: input.currency,
      totalMinor,
      billingSnapshot,
      notes: input.notes ?? null,
      issuedAt,
      dueAt,
      createdBy: input.userId,
      idempotencyKey: input.idempotencyKey ?? null,
      requestHash,
    });

    await deps.invoiceItems.insertMany(
      tx,
      insertedInvoice.id,
      input.items.map((item, index) => ({
        position: index + 1,
        description: item.description,
        quantity: item.quantity,
        unitAmountMinor: item.unitAmountMinor,
        amountMinor: computeLineAmountMinor(item),
      })),
    );

    await deps.invoiceEvents.insert(tx, {
      invoiceId: insertedInvoice.id,
      fromStatus: null,
      toStatus: "PENDING",
      userId: input.userId,
    });

    return insertedInvoice;
  });

  await deps.requests.markOutcome(deps.db, requestRow.id, "ACCEPTED", invoice.id);

  deps.logger.info("Invoice created", {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    requestId: input.audit.requestId,
    userId: input.userId,
  });

  try {
    await deps.pdfQueue.add("render", { invoiceId: invoice.id }, { jobId: `pdf-${invoice.id}` });
  } catch (err) {
    deps.logger.error("Failed to enqueue PDF render job; the sweeper will pick this invoice up", {
      invoiceId: invoice.id,
      error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: err },
    });
  }

  return toResult(invoice, false);
}
