import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/app";
import { senderProfile } from "@/config/sender";
import { closeDb, db } from "@/db/client";
import { redisClient } from "@/lib/redis";
import type { Mailer, OutgoingMail, SendResult } from "@/mail/mailer";
import { emailQueue } from "@/queue/emailQueue";
import { startWorkers, stopWorkers, type WorkerHandles } from "@/queue/bootstrap";
import { pdfQueue } from "@/queue/pdfQueue";
import { findInvoiceDocument, upsertInvoiceDocument } from "@/repositories/invoiceDocuments.repository";
import { findInvoiceById, findStuckInvoices } from "@/repositories/invoices.repository";
import { listInvoiceItems } from "@/repositories/invoiceItems.repository";
import { transition, claim } from "@/services/invoiceStatus.service";
import { logger } from "@/utils/logger";
import { seedTestFixtures, TEST_CLIENT_EMAIL } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";

const app = createApp();

let handles: WorkerHandles;
const sentMails: OutgoingMail[] = [];
const fakeMailer: Mailer = {
  send: vi.fn(async (mail: OutgoingMail): Promise<SendResult> => {
    sentMails.push(mail);
    return { messageId: "fake-provider-message-id" };
  }),
};

beforeAll(async () => {
  await seedTestFixtures();
  handles = await startWorkers({
    db,
    invoices: { findById: findInvoiceById, findStuck: findStuckInvoices },
    items: { list: listInvoiceItems },
    documents: { upsert: upsertInvoiceDocument, findByInvoiceId: findInvoiceDocument },
    status: { claim, transition },
    mailer: fakeMailer,
    sender: senderProfile,
    logger,
  });
}, 30_000);

beforeEach(async () => {
  await truncateInvoiceTables();
  sentMails.length = 0;
  vi.mocked(fakeMailer.send).mockClear();
});

afterAll(async () => {
  await stopWorkers(handles);
  await pdfQueue.close();
  await emailQueue.close();
  await redisClient.quit();
  await closeDb();
}, 30_000);

function waitForStatus(invoiceId: string, target: string, timeoutMs = 20_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const poll = async (): Promise<void> => {
      const invoice = await findInvoiceById(db, invoiceId);

      if (invoice?.status === target) {
        resolve();
        return;
      }

      if (invoice?.status === "FAILED" || Date.now() > deadline) {
        reject(new Error(`Invoice ${invoiceId} did not reach ${target} in time (status: ${invoice?.status})`));
        return;
      }

      setTimeout(() => void poll(), 200);
    };

    void poll();
  });
}

describe("Pipeline: intake -> PDF worker -> email worker", () => {
  it("takes a created invoice all the way to SENT with a non-empty PDF attachment", async () => {
    const created = await request(app)
      .post("/api/invoices")
      .send({
        email: TEST_CLIENT_EMAIL,
        items: [{ description: "End-to-end pipeline test", quantity: 1, unitAmountMinor: 12_345 }],
      });

    expect(created.status).toBe(202);

    await waitForStatus(created.body.invoiceId, "SENT");

    const finalInvoice = await findInvoiceById(db, created.body.invoiceId);
    expect(finalInvoice?.status).toBe("SENT");
    expect(finalInvoice?.pdfGeneratedAt).not.toBeNull();
    expect(finalInvoice?.sentAt).not.toBeNull();

    expect(fakeMailer.send).toHaveBeenCalledTimes(1);
    const mail = sentMails[0];
    expect(mail?.attachment.content.byteLength).toBeGreaterThan(0);
    expect(mail?.attachment.content.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(mail?.to).toBe(TEST_CLIENT_EMAIL);
  }, 30_000);
});
