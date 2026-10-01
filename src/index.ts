import "dotenv/config";
import type { Server } from "node:http";
import { createApp } from "./app";
import { env } from "@/config/env";
import { closeDb } from "@/db/client";
import { redisClient } from "@/lib/redis";
import { pdfQueue } from "@/queue/pdfQueue";
import { logger } from "@/utils/logger";

const app = createApp();

const server: Server = app.listen(env.PORT, () => {
  logger.info(`API listening on port ${env.PORT}`, { port: env.PORT, nodeEnv: env.NODE_ENV });
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info(`Received ${signal}, shutting down gracefully`);

  const forceExitTimer = setTimeout(() => {
    logger.error("Graceful shutdown timed out; forcing exit");
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  server.close(() => {
    void (async () => {
      try {
        await pdfQueue.close();
        await redisClient.quit();
        await closeDb();
        clearTimeout(forceExitTimer);
        logger.info("Shutdown complete");
        process.exit(0);
      } catch (err) {
        logger.error("Error during shutdown", {
          error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: err },
        });
        process.exit(1);
      }
    })();
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
