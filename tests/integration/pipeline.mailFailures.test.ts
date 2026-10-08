import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("MAIL_CONFIG_PAUSE_MS", "1500");
});

import { createApp } from "@/app";
import { closeDb, db } from "@/db/client";
import { redisClient } from "@/lib/redis";
import { stopWorkers, type WorkerHandles } from "@/queue/bootstrap";
import { emailQueue } from "@/queue/emailQueue";
import { pdfQueue } from "@/queue/pdfQueue";
import { findInvoiceById } from "@/repositories/invoices.repository";
import { seedTestFixtures } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";
import { loginAsUser } from "./helpers/auth";
import { startMailgunStub, type MailgunStub } from "./helpers/mailgunStub";
import { createInvoiceViaApi, startPipeline, waitForStatus } from "./helpers/pipeline";
import { waitForRedisReady } from "./helpers/redis";

const app = createApp();
let authCookie: string;
let handles: WorkerHandles | undefined;
let stub: MailgunStub | undefined;

beforeAll(async () => {
  await waitForRedisReady();
  await seedTestFixtures();
  authCookie = await loginAsUser(app);
}, 30_000);

beforeEach(async () => {
  await truncateInvoiceTables();
});

afterEach(async () => {
  if (handles) {
    await stopWorkers(handles);
    handles = undefined;
  }
  await emailQueue.resume();
  await stub?.close();
  stub = undefined;
});

afterAll(async () => {
  await pdfQueue.close();
  await emailQueue.close();
  await redisClient.quit();
  await closeDb();
}, 30_000);

async function statusOf(invoiceId: string): Promise<string | undefined> {
  return (await findInvoiceById(db, invoiceId))?.status;
}

describe("temporary failures are retried and recover", () => {
  it("a dropped connection is retried (it used to go straight to FAILED): SENT after exactly 2 requests", async () => {
    stub = await startMailgunStub(["drop"]);
    handles = await startPipeline(stub);

    const invoiceId = await createInvoiceViaApi(app, authCookie);

    expect(await waitForStatus(invoiceId, "SENT", 15_000)).toBe("SENT");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(stub.requests).toHaveLength(2);
  }, 30_000);

  it("a hung Mailgun is cut off by the HTTP timeout, the slot is freed and the retry succeeds", async () => {
    stub = await startMailgunStub(["hang"]);
    handles = await startPipeline(stub, { timeoutMs: 400 });

    const invoiceId = await createInvoiceViaApi(app, authCookie);

    expect(await waitForStatus(invoiceId, "SENT", 15_000)).toBe("SENT");
    expect(stub.requests).toHaveLength(2);
  }, 30_000);

  it("a 429 is retried", async () => {
    stub = await startMailgunStub([{ status: 429, body: { message: "slow down" } }]);
    handles = await startPipeline(stub);

    const invoiceId = await createInvoiceViaApi(app, authCookie);

    expect(await waitForStatus(invoiceId, "SENT", 15_000)).toBe("SENT");
    expect(stub.requests).toHaveLength(2);
  }, 30_000);
});

describe("a failure that is the invoice's own is permanent", () => {
  it("a genuine 400 fails the invoice at once, with no retry", async () => {
    stub = await startMailgunStub([{ status: 400, body: { message: "to parameter is not a valid address" } }]);
    handles = await startPipeline(stub);

    const invoiceId = await createInvoiceViaApi(app, authCookie);

    expect(await waitForStatus(invoiceId, "SENT", 15_000)).toBe("FAILED");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(stub.requests).toHaveLength(1);
    expect((await findInvoiceById(db, invoiceId))?.lastError).toContain("Bad Request");
  }, 30_000);
});

describe("a configuration failure is not the invoices' fault", () => {
  it("a rejected key pauses the queue and fails NO invoice; once fixed, everything is delivered", async () => {
    stub = await startMailgunStub();
    stub.setDefault({ status: 401, body: { message: "Invalid credentials" } });
    handles = await startPipeline(stub);

    const ids = [
      await createInvoiceViaApi(app, authCookie, "one"),
      await createInvoiceViaApi(app, authCookie, "two"),
      await createInvoiceViaApi(app, authCookie, "three"),
    ];

    await vi.waitFor(async () => expect(await emailQueue.isPaused()).toBe(true), { timeout: 15_000, interval: 50 });
    await vi.waitFor(
      async () => {
        const statuses = await Promise.all(ids.map(statusOf));
        expect(statuses).toEqual(["PDF_READY", "PDF_READY", "PDF_READY"]);
      },
      { timeout: 15_000, interval: 100 },
    );
    const lastErrors = (await Promise.all(ids.map((id) => findInvoiceById(db, id)))).map((row) => row?.lastError);
    const explained = lastErrors.filter((message): message is string => typeof message === "string");
    expect(explained.length).toBeGreaterThan(0);
    for (const message of explained) {
      expect(message).toContain("configuration");
      expect(message).toContain("401");
    }

    stub.setDefault({ status: 200, body: { id: "<fixed@mg.example.com>", message: "Queued. Thank you." } });
    for (const id of ids) {
      expect(await waitForStatus(id, "SENT", 20_000)).toBe("SENT");
    }
    expect(await emailQueue.isPaused()).toBe(false);
  }, 60_000);

  it("a worker restart un-pauses a queue a previous process left paused", async () => {
    await emailQueue.pause();
    stub = await startMailgunStub();

    handles = await startPipeline(stub);

    expect(await emailQueue.isPaused()).toBe(false);
  }, 30_000);
});
