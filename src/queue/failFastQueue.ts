import { Queue, type QueueOptions } from "bullmq";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { withTimeout } from "@/utils/withTimeout";

export class FailFastQueue<DataType> extends Queue<DataType> {
  constructor(name: string, options: QueueOptions) {
    super(name, options);

    this.on("error", (err: Error) => {
      logger.warn("Queue producer connection error", { queue: name, error: err.message });
    });
  }

  override add(...args: Parameters<Queue<DataType>["add"]>): ReturnType<Queue<DataType>["add"]> {
    return withTimeout(super.add(...args), env.QUEUE_ENQUEUE_TIMEOUT_MS, `Enqueue on queue "${this.name}"`);
  }
}
