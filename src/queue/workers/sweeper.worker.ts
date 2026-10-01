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

 * a worker may genuinely still be mid-job there, so re-adding a job risks racing it; a
 * genuinely stuck one is instead caught by the staleBefore-gated self-transition inside
 * invoicePdf.service.ts / invoiceEmail.service.ts, surfaced via a warn log, and resolved by a
 * human through POST /api/invoices/:id/retry. */
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
