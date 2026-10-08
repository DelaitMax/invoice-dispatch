import type { Queue } from "bullmq";
import type { Logger } from "@/utils/logger";

export interface QueueBreaker {
  trip(reason: string): Promise<void>;
  resume(): Promise<void>;
  dispose(): void;
}

export function createQueueBreaker(options: {
  readonly queue: Pick<Queue, "pause" | "resume" | "name">;
  readonly pauseMs: number;
  readonly logger: Logger;
}): QueueBreaker {
  const { queue, pauseMs, logger } = options;
  let tripped = false;
  let timer: NodeJS.Timeout | undefined;

  async function resume(): Promise<void> {
    tripped = false;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    try {
      await queue.resume();
      logger.info("Queue resumed", { queue: queue.name });
    } catch (err) {
      logger.warn("Failed to resume queue", {
        queue: queue.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    async trip(reason: string): Promise<void> {
      if (tripped) {
        return;
      }
      tripped = true;

      logger.error("ALERT: queue paused because of a deployment-wide failure; invoices are NOT being failed", {
        alert: "QUEUE_PAUSED",
        queue: queue.name,
        reason,
        resumesInMs: pauseMs,
      });

      try {
        await queue.pause();
      } catch (err) {
        logger.error("Failed to pause queue after a deployment-wide failure", {
          queue: queue.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      timer = setTimeout(() => {
        void resume();
      }, pauseMs);
      timer.unref();
    },

    resume,

    dispose(): void {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
