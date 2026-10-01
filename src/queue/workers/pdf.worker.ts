import { UnrecoverableError, Worker, type Job } from "bullmq";
import { env } from "@/config/env";
import { QUEUE_NAME_PDF } from "@/constants";
import { renderAndStoreInvoicePdf, type PdfDeps } from "@/services/invoicePdf.service";
import type { PdfJobData } from "@/types/queue.types";
import { createQueueConnection } from "../connection";

function isFinalAttempt(job: Job<PdfJobData>): boolean {
  const attempts = job.opts.attempts ?? 1;
  return job.attemptsMade + 1 >= attempts;
}

async function markFailedIfExhausted(job: Job<PdfJobData>, err: unknown, deps: PdfDeps): Promise<void> {
  if (err instanceof UnrecoverableError || !isFinalAttempt(job)) {
    return;
  }

  const lastError = err instanceof Error ? err.message : String(err);

  await deps.status
    .transition(deps.db, deps, job.data.invoiceId, ["PENDING", "PDF_RENDERING"], "FAILED", { lastError })
    .catch((transitionErr: unknown) => {
      deps.logger.error("Failed to mark invoice FAILED after exhausting PDF render attempts", {
        invoiceId: job.data.invoiceId,
        error: transitionErr instanceof Error ? transitionErr.message : String(transitionErr),
      });
    });
}

export function createPdfWorker(deps: PdfDeps): Worker<PdfJobData> {
  const worker = new Worker<PdfJobData>(
    QUEUE_NAME_PDF,
    async (job: Job<PdfJobData>) => {
      try {
        await renderAndStoreInvoicePdf(job.data.invoiceId, deps);
      } catch (err) {
        await markFailedIfExhausted(job, err, deps);
        throw err;
      }
    },
    { connection: createQueueConnection(), concurrency: env.QUEUE_PDF_CONCURRENCY },
  );

  worker.on("failed", (job, err) => {
    const final = !job || isFinalAttempt(job);
    const meta = { invoiceId: job?.data.invoiceId, attemptsMade: job?.attemptsMade, error: err.message };

    if (final) {
      deps.logger.error("PDF render job failed permanently; invoice marked FAILED", meta);
    } else {
      deps.logger.warn("PDF render job failed, will retry", meta);
    }
  });

  return worker;
}
