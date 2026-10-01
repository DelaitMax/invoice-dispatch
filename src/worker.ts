import "dotenv/config";
import { db, closeDb } from "@/db/client";
import { redisClient } from "@/lib/redis";
import { createMailer } from "@/mail";
import { senderProfile } from "@/config/sender";
import { findInvoiceDocument, upsertInvoiceDocument } from "@/repositories/invoiceDocuments.repository";
import { findInvoiceById } from "@/repositories/invoices.repository";
import { listInvoiceItems } from "@/repositories/invoiceItems.repository";
import { transition } from "@/services/invoiceStatus.service";
import { logger } from "@/utils/logger";
import { env } from "@/config/env";
import { startWorkers, stopWorkers, type WorkerHandles } from "@/queue/bootstrap";

async function main(): Promise<void> {
  const handles: WorkerHandles = await startWorkers({
    db,
    invoices: { findById: findInvoiceById },
    items: { list: listInvoiceItems },
    documents: { upsert: upsertInvoiceDocument, findByInvoiceId: findInvoiceDocument },
    status: { transition },
    mailer: createMailer(env),
    sender: senderProfile,
    logger,
  });

  logger.info("Worker process started", {
    pdfConcurrency: env.QUEUE_PDF_CONCURRENCY,
    emailConcurrency: env.QUEUE_EMAIL_CONCURRENCY,
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

    try {
      await stopWorkers(handles);
      await redisClient.quit();
      await closeDb();
      clearTimeout(forceExitTimer);
      logger.info("Worker shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error("Error during worker shutdown", {
        error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: err },
      });
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  logger.error("Worker process failed to start", {
    error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: err },
  });
  process.exitCode = 1;
});
