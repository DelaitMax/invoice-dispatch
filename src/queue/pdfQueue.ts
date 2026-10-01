import { Queue } from "bullmq";
import { env } from "@/config/env";
import { QUEUE_NAME_PDF } from "@/constants";
import type { PdfJobData } from "@/types/queue.types";
import { createQueueConnection } from "./connection";

export const pdfQueue = new Queue<PdfJobData>(QUEUE_NAME_PDF, {
  connection: createQueueConnection(),
  defaultJobOptions: {
    attempts: env.QUEUE_JOB_ATTEMPTS,
    backoff: { type: "exponential", delay: env.QUEUE_BACKOFF_DELAY_MS },
    removeOnComplete: true,
    removeOnFail: true,
  },
});
