import { randomUUID } from "node:crypto";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import { env } from "@/config/env";
import { QUEUE_NAME_EMAIL } from "@/constants";
import { MailConfigurationError } from "@/mail/errors";
import { ClaimLostError } from "@/services/claimLost.error";
import { type EmailDeps, sendInvoiceEmail } from "@/services/invoiceEmail.service";
import type { EmailJobData } from "@/types/queue.types";
import { createWorkerConnection } from "../connection";
import type { QueueBreaker } from "../queueBreaker";

function isFinalAttempt(job: Job<EmailJobData>): boolean {
  const attempts = job.opts.attempts ?? 1;
  return job.attemptsMade + 1 >= attempts;
}

export interface EmailWorkerDeps extends EmailDeps {
  readonly breaker: QueueBreaker;
}

export function createEmailWorker(deps: EmailWorkerDeps): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    QUEUE_NAME_EMAIL,
    async (job: Job<EmailJobData>) => {
      try {
        await sendInvoiceEmail(job.data.invoiceId, isFinalAttempt(job), deps, job.id ?? randomUUID());
      } catch (err) {
        if (err instanceof MailConfigurationError) {
          await deps.breaker.trip(err.message);
        }
        throw err;
      }
    },
    {
      connection: createWorkerConnection(),
      concurrency: env.QUEUE_EMAIL_CONCURRENCY,
      limiter: { max: env.EMAIL_RATE_LIMIT_MAX, duration: env.EMAIL_RATE_LIMIT_DURATION_MS },
    },
  );

  worker.on("failed", (job, err) => {
    const final = !job || isFinalAttempt(job) || err instanceof UnrecoverableError;
    const meta = { invoiceId: job?.data.invoiceId, attemptsMade: job?.attemptsMade, error: err.message };

    if (err instanceof MailConfigurationError) {
      deps.logger.error("Email job hit a mail configuration error; invoice left as is, queue paused", meta);
    } else if (err instanceof ClaimLostError && final) {
      deps.logger.error("Email job gave up: the invoice stayed claimed by another executor", meta);
    } else if (final) {
      deps.logger.error("Email send job failed permanently; invoice marked FAILED", meta);
    } else {
      deps.logger.warn("Email send job failed, will retry", meta);
    }
  });

  return worker;
}
