import { env } from "@/config/env";
import { QUEUE_NAME_PDF } from "@/constants";
import type { PdfJobData } from "@/types/queue.types";
import { createProducerConnection } from "./connection";
import { FailFastQueue } from "./failFastQueue";

export const pdfQueue = new FailFastQueue<PdfJobData>(QUEUE_NAME_PDF, {
  connection: createProducerConnection(),
  defaultJobOptions: {
    attempts: env.QUEUE_JOB_ATTEMPTS,
    backoff: { type: "exponential", delay: env.QUEUE_BACKOFF_DELAY_MS },
    removeOnComplete: true,
    removeOnFail: true,
  },
});
