import type { Worker } from "bullmq";
import type { Database } from "@/db/client";
import { launchBrowser, type BrowserHandle } from "@/pdf/browser";
import { env } from "@/config/env";
import type {
  InvoiceDocumentsRepository,
  InvoiceItemsRepository,
  InvoicesRepository,
} from "@/services/invoicePdf.service";
import type { StatusService } from "@/services/invoiceStatus.service";
import type { PdfJobData } from "@/types/queue.types";
import type { Logger } from "@/utils/logger";
import { emailQueue } from "./emailQueue";
import { createPdfWorker } from "./workers/pdf.worker";

export interface BootstrapWorkersDeps {
  readonly db: Database;
  readonly invoices: InvoicesRepository;
  readonly items: InvoiceItemsRepository;
  readonly documents: InvoiceDocumentsRepository;
  readonly status: StatusService;
  readonly logger: Logger;
}

export interface WorkerHandles {
  readonly browser: BrowserHandle;
  readonly pdfWorker: Worker<PdfJobData>;
}

export async function startWorkers(deps: BootstrapWorkersDeps): Promise<WorkerHandles> {
  const browser = await launchBrowser(
    env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: env.PUPPETEER_EXECUTABLE_PATH } : {},
  );

  const pdfWorker = createPdfWorker({
    db: deps.db,
    invoices: deps.invoices,
    items: deps.items,
    documents: deps.documents,
    status: deps.status,
    browser,
    emailQueue,
    maxBytes: env.PDF_MAX_BYTES,
    timeoutMs: env.PDF_TIMEOUT_MS,
    logger: deps.logger,
  });

  return { browser, pdfWorker };
}

export async function stopWorkers(handles: WorkerHandles): Promise<void> {
  await handles.pdfWorker.close();
  await handles.browser.close();
}
