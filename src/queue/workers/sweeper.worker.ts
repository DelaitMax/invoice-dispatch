import type { Queue } from "bullmq";
import type { Database } from "@/db/client";
import { SWEEPER_BATCH_SIZE } from "@/constants";
import type { findStuckInvoices } from "@/repositories/invoices.repository";
import type { InvoiceStatus } from "@/types/invoice.types";
import type { EmailJobData, PdfJobData } from "@/types/queue.types";
import type { Logger } from "@/utils/logger";

export interface SweeperInvoicesRepository {
  readonly findStuck: typeof findStuckInvoices;
}

export interface SweeperDeps {
  readonly db: Database;
  readonly invoices: SweeperInvoicesRepository;
  readonly pdfQueue: Pick<Queue<PdfJobData>, "add">;
  readonly emailQueue: Pick<Queue<EmailJobData>, "add">;
  readonly stuckTimeoutMs: number;
  readonly logger: Logger;
}

/** Only the two genuinely in-flight statuses — PENDING and PDF_READY are momentary waiting
 * states a job picks up almost immediately, not places an invoice gets stuck. */
const STUCK_STATUSES: readonly InvoiceStatus[] = ["PDF_RENDERING", "EMAIL_SENDING"];

export async function sweepStuckInvoices(deps: SweeperDeps): Promise<number> {
  const updatedBefore = new Date(Date.now() - deps.stuckTimeoutMs);
  const stuckInvoices = await deps.invoices.findStuck(deps.db, {
    statuses: STUCK_STATUSES,
    updatedBefore,
    limit: SWEEPER_BATCH_SIZE,
  });

  for (const invoice of stuckInvoices) {
    try {
      if (invoice.status === "PDF_RENDERING") {
        await deps.pdfQueue.add("render", { invoiceId: invoice.id }, { jobId: `pdf-${invoice.id}` });
      } else {
        await deps.emailQueue.add("send", { invoiceId: invoice.id }, { jobId: `email-${invoice.id}` });
      }
      deps.logger.info("Sweeper re-enqueued a stuck invoice", { invoiceId: invoice.id, status: invoice.status });
    } catch (err) {
      deps.logger.error("Sweeper failed to re-enqueue a stuck invoice", {
        invoiceId: invoice.id,
        status: invoice.status,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return stuckInvoices.length;
}

export interface SweeperHandle {
  stop(): void;
}

export function startSweeper(deps: SweeperDeps, intervalMs: number): SweeperHandle {
  const timer = setInterval(() => {
    sweepStuckInvoices(deps).catch((err: unknown) => {
      deps.logger.error("Sweeper pass failed", { error: err instanceof Error ? err.message : String(err) });
    });
  }, intervalMs);
  timer.unref();

  return { stop: () => clearInterval(timer) };
}
