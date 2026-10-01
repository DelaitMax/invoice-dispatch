import type { Worker } from "bullmq";
import type { Database } from "@/db/client";
import { launchBrowser, type BrowserHandle } from "@/pdf/browser";
import { env } from "@/config/env";
import type { Mailer } from "@/mail/mailer";
import type {
  InvoiceDocumentsRepository as PdfInvoiceDocumentsRepository,
  InvoiceItemsRepository,
  InvoicesRepository as PdfInvoicesRepository,
} from "@/services/invoicePdf.service";
import type {
  InvoiceDocumentsRepository as EmailInvoiceDocumentsRepository,
  InvoicesRepository as EmailInvoicesRepository,
} from "@/services/invoiceEmail.service";
import type { StatusService } from "@/services/invoiceStatus.service";
import type { SenderProfile } from "@/config/sender";
import type { EmailJobData, PdfJobData } from "@/types/queue.types";
import type { Logger } from "@/utils/logger";
import { emailQueue } from "./emailQueue";
import { createEmailWorker } from "./workers/email.worker";
import { createPdfWorker } from "./workers/pdf.worker";

export interface BootstrapWorkersDeps {
  readonly db: Database;
  readonly invoices: PdfInvoicesRepository & EmailInvoicesRepository;
  readonly items: InvoiceItemsRepository;
  readonly documents: PdfInvoiceDocumentsRepository & EmailInvoiceDocumentsRepository;
  readonly status: StatusService;
  readonly mailer: Mailer;
  readonly sender: SenderProfile;
  readonly logger: Logger;
}

export interface WorkerHandles {
  readonly browser: BrowserHandle;
  readonly pdfWorker: Worker<PdfJobData>;
  readonly emailWorker: Worker<EmailJobData>;
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

  const emailWorker = createEmailWorker({
    db: deps.db,
    invoices: deps.invoices,
    documents: deps.documents,
    status: deps.status,
    mailer: deps.mailer,
    sender: deps.sender,
    logger: deps.logger,
  });

  return { browser, pdfWorker, emailWorker };
}

export async function stopWorkers(handles: WorkerHandles): Promise<void> {
  await handles.pdfWorker.close();
  await handles.emailWorker.close();
  await handles.browser.close();
}
