import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "@/app";
import { senderProfile } from "@/config/sender";
import { closeDb, db } from "@/db/client";
import { redisClient } from "@/lib/redis";
import { createMailgunMailer } from "@/mail/mailgun.mailer";
import { emailQueue } from "@/queue/emailQueue";
import { startWorkers, stopWorkers, type WorkerHandles } from "@/queue/bootstrap";
import { pdfQueue } from "@/queue/pdfQueue";
import { findInvoiceDocument, upsertInvoiceDocument } from "@/repositories/invoiceDocuments.repository";
import { listInvoiceEvents } from "@/repositories/invoiceEvents.repository";
import { findExpiredLeases, findInvoiceById, findStuckInvoices } from "@/repositories/invoices.repository";
import { listInvoiceItems } from "@/repositories/invoiceItems.repository";
import { claim, transition } from "@/services/invoiceStatus.service";
import { logger } from "@/utils/logger";
import { seedTestFixtures, TEST_CLIENT_EMAIL } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";
import { loginAsUser } from "./helpers/auth";
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

async function startPipeline(mailgun: MailgunStub): Promise<WorkerHandles> {
  stub = mailgun;
  handles = await startWorkers({
    db,
    invoices: { findById: findInvoiceById, findStuck: findStuckInvoices, findExpiredLeases },
    items: { list: listInvoiceItems },
    documents: { upsert: upsertInvoiceDocument, findByInvoiceId: findInvoiceDocument },
    status: { claim, transition },
    mailer: createMailgunMailer({
      apiKey: "key-test",
      domain: "mg.example.com",
      baseUrl: mailgun.url,
      fromName: "Test Sender",
      fromEmail: "test-sender@example.com",
    }),
    sender: senderProfile,
    logger,
  });
  return handles;
}

async function waitForStatus(invoiceId: string, target: string, timeoutMs: number): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  let status: string | undefined;
  while (Date.now() < deadline) {
    status = (await findInvoiceById(db, invoiceId))?.status;
    if (status === target || status === "FAILED") {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return status;
}

async function createInvoiceViaApi(): Promise<string> {
  const created = await request(app)
    .post("/api/invoices")
    .set("Cookie", authCookie)
    .send({
      email: TEST_CLIENT_EMAIL,
      items: [{ description: "Retry pipeline test", quantity: 1, unitAmountMinor: 12_345 }],
    });
  expect(created.status).toBe(202);
  return created.body.invoiceId as string;
}

describe("Pipeline: a transient mail failure is retried by BullMQ and ends in SENT", () => {
  it("503 first, then OK: invoice ends SENT after exactly 2 calls to Mailgun", async () => {
    await startPipeline(await startMailgunStub([{ status: 503, body: { message: "Service Unavailable" } }]));

    const invoiceId = await createInvoiceViaApi();

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
