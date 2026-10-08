import { randomUUID } from "node:crypto";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import { env } from "@/config/env";
import { QUEUE_NAME_PDF } from "@/constants";
import { ClaimLostError } from "@/services/claimLost.error";
import { renderAndStoreInvoicePdf, type PdfDeps } from "@/services/invoicePdf.service";
import type { PdfJobData } from "@/types/queue.types";
import { createWorkerConnection } from "../connection";

function isFinalAttempt(job: Job<PdfJobData>): boolean {
  const attempts = job.opts.attempts ?? 1;
  return job.attemptsMade + 1 >= attempts;
}

async function markFailedIfExhausted(
  job: Job<PdfJobData>,
  err: unknown,
  deps: PdfDeps,
  claimToken: string,
): Promise<void> {
  if (err instanceof UnrecoverableError || err instanceof ClaimLostError || !isFinalAttempt(job)) {
    return;
  }

  const lastError = err instanceof Error ? err.message : String(err);

  await deps.status
    .transition(
      deps.db,
      deps,
      job.data.invoiceId,
      ["PENDING", "PDF_RENDERING"],
      "FAILED",
      { lastError },
      { claimToken },
    )
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
      const claimToken = job.id ?? randomUUID();
      try {
        await renderAndStoreInvoicePdf(job.data.invoiceId, deps, claimToken);
      } catch (err) {
        await markFailedIfExhausted(job, err, deps, claimToken);
        throw err;
      }
    },
    { connection: createWorkerConnection(), concurrency: env.QUEUE_PDF_CONCURRENCY },
  );

  worker.on("failed", (job, err) => {
    const final = !job || isFinalAttempt(job);
    const meta = { invoiceId: job?.data.invoiceId, attemptsMade: job?.attemptsMade, error: err.message };

    if (err instanceof ClaimLostError && final) {
      deps.logger.error("PDF job gave up: the invoice stayed claimed by another executor", meta);
    } else if (final) {
      deps.logger.error("PDF render job failed permanently; invoice marked FAILED", meta);
    } else {
      deps.logger.warn("PDF render job failed, will retry", meta);
    }
  });

  return worker;
}
