import { UnrecoverableError } from "bullmq";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, db } from "@/db/client";
import { listInvoiceEvents } from "@/repositories/invoiceEvents.repository";
import { sendInvoiceEmail } from "@/services/invoiceEmail.service";
import { ClaimLostError } from "@/services/claimLost.error";
import { claim } from "@/services/invoiceStatus.service";
import { logger } from "@/utils/logger";
import { seedTestFixtures } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";
import {
  buildEmailDeps,
  createFakeMailer,
  createReadyInvoice,
  expireLease,
  getInvoice,
  startSendingAs,
} from "./helpers/invoices";

beforeAll(async () => {
  await seedTestFixtures();
});

beforeEach(async () => {
  await truncateInvoiceTables();
});

afterAll(async () => {
  await closeDb();
});

describe("claim ownership", () => {
  it("the same job re-takes its own live claim (BullMQ restarting it after a crash) and sends", async () => {
    const invoiceId = await createReadyInvoice();
    await startSendingAs(invoiceId, "email-job-1");
    const mailer = createFakeMailer();

    await sendInvoiceEmail(invoiceId, false, buildEmailDeps(mailer), "email-job-1");

    expect(mailer.sent).toHaveLength(1);
    const invoice = await getInvoice(invoiceId);
    expect(invoice.status).toBe("SENT");
    expect(invoice.claimToken).toBeNull();
    expect(invoice.leaseUntil).toBeNull();
  });

  it("a different executor is refused while the lease is live — with an error, not a silent return", async () => {
    const invoiceId = await createReadyInvoice();
    await startSendingAs(invoiceId, "email-job-1");
    const mailer = createFakeMailer();

    await expect(sendInvoiceEmail(invoiceId, false, buildEmailDeps(mailer), "someone-else")).rejects.toBeInstanceOf(
      ClaimLostError,
    );

    expect(mailer.sent).toHaveLength(0);
    const invoice = await getInvoice(invoiceId);
    expect(invoice.status).toBe("EMAIL_SENDING");
    expect(invoice.claimToken).toBe("email-job-1");
  });

  it("a different executor takes over once the lease has expired", async () => {
    const invoiceId = await createReadyInvoice();
    await startSendingAs(invoiceId, "email-job-1");
    await expireLease(invoiceId);
    const mailer = createFakeMailer();

    await sendInvoiceEmail(invoiceId, false, buildEmailDeps(mailer), "someone-else");

    expect(mailer.sent).toHaveLength(1);
    expect((await getInvoice(invoiceId)).status).toBe("SENT");
  });

  it("while one executor is mid-send, a concurrent one fails loudly instead of vanishing — and nothing is sent twice", async () => {
    const invoiceId = await createReadyInvoice();

    let releaseFirstSend: () => void = () => undefined;
    const firstSendMayFinish = new Promise<void>((resolve) => (releaseFirstSend = resolve));
    const mailer = createFakeMailer();
    const gatedMailer = {
      sent: mailer.sent,
      send: async (mail: Parameters<typeof mailer.send>[0]) => {
        await firstSendMayFinish;
        return mailer.send(mail);
      },
    };
    const deps = buildEmailDeps(gatedMailer);

    const first = sendInvoiceEmail(invoiceId, false, deps);
    await vi.waitFor(async () => expect((await getInvoice(invoiceId)).status).toBe("EMAIL_SENDING"));

    await expect(sendInvoiceEmail(invoiceId, false, deps)).rejects.toBeInstanceOf(ClaimLostError);

    releaseFirstSend();
    await first;

    expect(mailer.sent).toHaveLength(1);
    expect((await getInvoice(invoiceId)).status).toBe("SENT");
  });

  it("a duplicate that arrives after the invoice is SENT finishes quietly without sending (nothing left to do)", async () => {
    const invoiceId = await createReadyInvoice();
    const mailer = createFakeMailer();
    const deps = buildEmailDeps(mailer);

    await sendInvoiceEmail(invoiceId, false, deps);
    await sendInvoiceEmail(invoiceId, false, deps);

    expect(mailer.sent).toHaveLength(1);
  });

  it("a self-transition without an executor identity is refused (fails closed)", async () => {
    const invoiceId = await createReadyInvoice();
    await startSendingAs(invoiceId, "email-job-1");

    const result = await claim(db, { logger }, invoiceId, ["PDF_READY", "EMAIL_SENDING"], "EMAIL_SENDING");

    expect(result).toBeNull();
  });

  it("a stale executor whose lease was taken over cannot overwrite the new owner's outcome", async () => {
    const invoiceId = await createReadyInvoice();
    await startSendingAs(invoiceId, "zombie");
    await expireLease(invoiceId);
    const mailer = createFakeMailer();
    await sendInvoiceEmail(invoiceId, false, buildEmailDeps(mailer), "new-owner");
    expect((await getInvoice(invoiceId)).status).toBe("SENT");

    const result = await claim(
      db,
      { logger },
      invoiceId,
      ["EMAIL_SENDING"],
      "FAILED",
      { lastError: "zombie says no" },
      { claimToken: "zombie" },
    );

    expect(result).toBeNull();
    const invoice = await getInvoice(invoiceId);
    expect(invoice.status).toBe("SENT");
    expect(invoice.lastError).toBeNull();
  });
});

describe("a failed send hands the claim back", () => {
  it("temporary error on a non-final attempt: back to PDF_READY with the error recorded, then the retry sends", async () => {
    const invoiceId = await createReadyInvoice();
    const mailer = createFakeMailer([new Error("upstream said 503")]);
    const deps = buildEmailDeps(mailer);

    await expect(sendInvoiceEmail(invoiceId, false, deps, "email-job-1")).rejects.toThrow("upstream said 503");

    const afterFailure = await getInvoice(invoiceId);
    expect(afterFailure.status).toBe("PDF_READY");
    expect(afterFailure.lastError).toBe("upstream said 503");
    expect(afterFailure.claimToken).toBeNull();
    expect(afterFailure.leaseUntil).toBeNull();

    await sendInvoiceEmail(invoiceId, false, deps, "email-job-2");

    expect(mailer.sent).toHaveLength(1);
    const afterRetry = await getInvoice(invoiceId);
    expect(afterRetry.status).toBe("SENT");
    expect(afterRetry.lastError).toBeNull();
  });

  it("temporary error on the final attempt: FAILED with the error", async () => {
    const invoiceId = await createReadyInvoice();
    const mailer = createFakeMailer([new Error("still down")]);

    await expect(sendInvoiceEmail(invoiceId, true, buildEmailDeps(mailer), "email-job-1")).rejects.toThrow(
      "still down",
    );

    const invoice = await getInvoice(invoiceId);
    expect(invoice.status).toBe("FAILED");
    expect(invoice.lastError).toBe("still down");
    expect(invoice.claimToken).toBeNull();
  });

  it("permanent error: FAILED at once, as an UnrecoverableError", async () => {
    const invoiceId = await createReadyInvoice();
    const mailer = createFakeMailer([Object.assign(new Error("bad address"), { status: 400 })]);

    await expect(sendInvoiceEmail(invoiceId, false, buildEmailDeps(mailer), "email-job-1")).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect((await getInvoice(invoiceId)).status).toBe("FAILED");
  });

  it("records every hand-over in the audit trail", async () => {
    const invoiceId = await createReadyInvoice();
    const mailer = createFakeMailer([new Error("blip")]);
    const deps = buildEmailDeps(mailer);

    await sendInvoiceEmail(invoiceId, false, deps, "email-job-1").catch(() => undefined);
    await sendInvoiceEmail(invoiceId, false, deps, "email-job-1");

    const events = await listInvoiceEvents(db, invoiceId);
    expect(events.slice(-4).map((event) => event.toStatus)).toEqual([
      "EMAIL_SENDING",
      "PDF_READY",
      "EMAIL_SENDING",
      "SENT",
    ]);
  });
});
