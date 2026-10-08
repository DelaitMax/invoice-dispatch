import { env } from "@/config/env";
import { QUEUE_NAME_EMAIL } from "@/constants";
import type { EmailJobData } from "@/types/queue.types";
import { createProducerConnection } from "./connection";
import { FailFastQueue } from "./failFastQueue";

export const emailQueue = new FailFastQueue<EmailJobData>(QUEUE_NAME_EMAIL, {
  connection: createProducerConnection(),
  defaultJobOptions: {
    attempts: env.QUEUE_JOB_ATTEMPTS,
    backoff: { type: "exponential", delay: env.QUEUE_BACKOFF_DELAY_MS },
    removeOnComplete: true,
    removeOnFail: true,
  },
});
