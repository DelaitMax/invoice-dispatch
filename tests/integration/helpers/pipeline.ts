import request from "supertest";
import type { Express } from "express";
import { expect } from "vitest";
import { senderProfile } from "@/config/sender";
import { db } from "@/db/client";
import { createMailgunMailer } from "@/mail/mailgun.mailer";
import { startWorkers, type WorkerHandles } from "@/queue/bootstrap";
import { findInvoiceDocument, upsertInvoiceDocument } from "@/repositories/invoiceDocuments.repository";
import { findExpiredLeases, findInvoiceById, findStuckInvoices } from "@/repositories/invoices.repository";
import { listInvoiceItems } from "@/repositories/invoiceItems.repository";
import { claim, transition } from "@/services/invoiceStatus.service";
import { logger } from "@/utils/logger";
import { TEST_CLIENT_EMAIL } from "../fixtures";
import type { MailgunStub } from "./mailgunStub";

export async function startPipeline(
  mailgun: MailgunStub,
  options: { timeoutMs?: number } = {},
): Promise<WorkerHandles> {
  return startWorkers({
    db,
    invoices: { findById: findInvoiceById, findStuck: findStuckInvoices, findExpiredLeases },
    items: { list: listInvoiceItems },
    documents: { upsert: upsertInvoiceDocument, findByInvoiceId: findInvoiceDocument },
    status: { claim, transition },
    mailer: createMailgunMailer({
      apiKey: "key-test",
      domain: "mg.example.com",
      baseUrl: mailgun.url,
      timeoutMs: options.timeoutMs ?? 2_000,
      fromName: "Test Sender",
      fromEmail: "test-sender@example.com",
    }),
    sender: senderProfile,
    logger,
  });
}

export async function waitForStatus(invoiceId: string, target: string, timeoutMs: number): Promise<string | undefined> {
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

export async function createInvoiceViaApi(
  app: Express,
  cookie: string,
  description = "Pipeline test",
): Promise<string> {
  const created = await request(app)
    .post("/api/invoices")
    .set("Cookie", cookie)
    .send({ email: TEST_CLIENT_EMAIL, items: [{ description, quantity: 1, unitAmountMinor: 12_345 }] });
  expect(created.status).toBe(202);
  return created.body.invoiceId as string;
}
