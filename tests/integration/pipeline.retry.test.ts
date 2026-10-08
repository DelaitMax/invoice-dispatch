import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "@/app";
import { closeDb, db } from "@/db/client";
import { redisClient } from "@/lib/redis";
import { emailQueue } from "@/queue/emailQueue";
import { stopWorkers, type WorkerHandles } from "@/queue/bootstrap";
import { pdfQueue } from "@/queue/pdfQueue";
import { listInvoiceEvents } from "@/repositories/invoiceEvents.repository";
import { findInvoiceById } from "@/repositories/invoices.repository";
import { seedTestFixtures } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";
import { loginAsUser } from "./helpers/auth";
import { createInvoiceViaApi, startPipeline, waitForStatus } from "./helpers/pipeline";
import { startMailgunStub, type MailgunStub } from "./helpers/mailgunStub";

const app = createApp();
let authCookie: string;
let handles: WorkerHandles | undefined;
let stub: MailgunStub | undefined;

beforeAll(async () => {
  await seedTestFixtures();
  authCookie = await loginAsUser(app);
}, 30_000);

beforeEach(async () => {
  await truncateInvoiceTables();
});

afterAll(async () => {
  if (handles) {
    await stopWorkers(handles);
  }
  await stub?.close();
  await pdfQueue.close();
  await emailQueue.close();
  await redisClient.quit();
  await closeDb();
}, 30_000);

describe("Pipeline: a transient mail failure is retried by BullMQ and ends in SENT", () => {
  it("503 first, then OK: invoice ends SENT after exactly 2 calls to Mailgun", async () => {
    stub = await startMailgunStub([{ status: 503, body: { message: "Service Unavailable" } }]);
    handles = await startPipeline(stub);

    const invoiceId = await createInvoiceViaApi(app, authCookie);

    const finalStatus = await waitForStatus(invoiceId, "SENT", 15_000);
    expect(finalStatus).toBe("SENT");

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(stub?.requests).toHaveLength(2);

    const invoice = await findInvoiceById(db, invoiceId);
    expect(invoice?.status).toBe("SENT");
    expect(invoice?.sentAt).not.toBeNull();
    expect(invoice?.providerMessageId).toBe("<stub-message-id@mg.example.com>");
    expect(invoice?.lastError).toBeNull();

    const events = await listInvoiceEvents(db, invoiceId);
    expect(events.map((event) => event.toStatus)).toEqual([
      "PENDING",
      "PDF_RENDERING",
      "PDF_READY",
      "EMAIL_SENDING",
      "PDF_READY",
      "EMAIL_SENDING",
      "SENT",
    ]);
    expect(events[4]?.detail).toMatchObject({ lastError: expect.stringContaining("Service Unavailable") });
  }, 30_000);
});
