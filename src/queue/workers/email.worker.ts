import { Worker, type Job } from "bullmq";
import { env } from "@/config/env";
import { QUEUE_NAME_EMAIL } from "@/constants";
import { type EmailDeps, sendInvoiceEmail } from "@/services/invoiceEmail.service";
import type { EmailJobData } from "@/types/queue.types";
import { createQueueConnection } from "../connection";

function isFinalAttempt(job: Job<EmailJobData>): boolean {
  const attempts = job.opts.attempts ?? 1;
  return job.attemptsMade + 1 >= attempts;
}

export function createEmailWorker(deps: EmailDeps): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    QUEUE_NAME_EMAIL,
    async (job: Job<EmailJobData>) => {
      await sendInvoiceEmail(job.data.invoiceId, isFinalAttempt(job), deps);
    },
    { connection: createQueueConnection(), concurrency: env.QUEUE_EMAIL_CONCURRENCY },
  );

  worker.on("failed", (job, err) => {
    deps.logger.error("Email send job failed", {
      invoiceId: job?.data.invoiceId,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    });
  });

  return worker;
}
