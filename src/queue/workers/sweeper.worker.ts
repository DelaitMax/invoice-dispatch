import type { Queue } from "bullmq";
import type { Database } from "@/db/client";
import { SWEEPER_BATCH_SIZE } from "@/constants";
import type { findExpiredLeases, findStuckInvoices } from "@/repositories/invoices.repository";
import type { StatusService } from "@/services/invoiceStatus.service";
import type { InvoiceStatus } from "@/types/invoice.types";
import type { EmailJobData, PdfJobData } from "@/types/queue.types";
import type { Logger } from "@/utils/logger";

export interface SweeperInvoicesRepository {
  readonly findStuck: typeof findStuckInvoices;
  readonly findExpiredLeases: typeof findExpiredLeases;
}

export interface SweeperDeps {
  readonly db: Database;
  readonly invoices: SweeperInvoicesRepository;
  readonly status: Pick<StatusService, "claim">;
  readonly pdfQueue: Pick<Queue<PdfJobData>, "add">;
  readonly emailQueue: Pick<Queue<EmailJobData>, "add">;
  readonly stuckTimeoutMs: number;
  readonly logger: Logger;
}
const STUCK_STATUSES: readonly InvoiceStatus[] = ["PENDING", "PDF_READY"];

export async function sweepStuckInvoices(deps: SweeperDeps): Promise<number> {
  const updatedBefore = new Date(Date.now() - deps.stuckTimeoutMs);
  const stuckInvoices = await deps.invoices.findStuck(deps.db, {
    statuses: STUCK_STATUSES,
    updatedBefore,
    limit: SWEEPER_BATCH_SIZE,
  });

  for (const invoice of stuckInvoices) {
    try {
      if (invoice.status === "PENDING") {
        await deps.pdfQueue.add("render", { invoiceId: invoice.id }, { jobId: `pdf-${invoice.id}` });
      } else {
        await deps.emailQueue.add("send", { invoiceId: invoice.id }, { jobId: `email-${invoice.id}` });
      }
      deps.logger.debug("Sweeper re-enqueued a stuck invoice", { invoiceId: invoice.id, status: invoice.status });
    } catch (err) {
      deps.logger.error("Sweeper failed to re-enqueue a stuck invoice", {
        invoiceId: invoice.id,
        status: invoice.status,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (stuckInvoices.length > 0) {
    deps.logger.warn("Sweeper re-enqueued stuck invoices", { count: stuckInvoices.length });
  }

  return stuckInvoices.length;
}

function expiredLeaseError(invoice: { id: string; status: InvoiceStatus }): string {
  if (invoice.status === "EMAIL_SENDING") {
    return (
      "Email sending was interrupted (the worker stopped renewing its claim). It is UNKNOWN whether the email " +
      `was delivered: check Mailgun events for v:invoice-id=${invoice.id} before retrying, a blind retry may send a duplicate.`
    );
  }
  return "PDF rendering was interrupted (the worker stopped renewing its claim); nothing was sent, safe to retry.";
}

export async function failExpiredLeases(deps: SweeperDeps): Promise<number> {
  const expired = await deps.invoices.findExpiredLeases(deps.db, { limit: SWEEPER_BATCH_SIZE });
  let failed = 0;

  for (const invoice of expired) {
    try {
      const updated = await deps.status.claim(
        deps.db,
        deps,
        invoice.id,
        [invoice.status],
        "FAILED",
        { lastError: expiredLeaseError(invoice) },
        { requireExpiredLease: true },
      );

      if (updated) {
        failed += 1;
        deps.logger.error("Lease monitor failed an invoice whose executor stopped renewing its claim", {
          invoiceId: invoice.id,
          previousStatus: invoice.status,
          leaseUntil: invoice.leaseUntil,
          deliveryUnknown: invoice.status === "EMAIL_SENDING",
        });
      }
    } catch (err) {
      deps.logger.error("Lease monitor failed to process an expired lease", {
        invoiceId: invoice.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return failed;
}

export interface SweeperHandle {
  stop(): void;
}

export function startSweeper(deps: SweeperDeps, intervalMs: number): SweeperHandle {
  const timer = setInterval(() => {
    sweepStuckInvoices(deps).catch((err: unknown) => {
      deps.logger.error("Sweeper pass failed", { error: err instanceof Error ? err.message : String(err) });
    });
    failExpiredLeases(deps).catch((err: unknown) => {
      deps.logger.error("Lease monitor pass failed", { error: err instanceof Error ? err.message : String(err) });
    });
  }, intervalMs);
  timer.unref();

  return { stop: () => clearInterval(timer) };
}
