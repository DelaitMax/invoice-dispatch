import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, db } from "@/db/client";
import { failExpiredLeases, type SweeperDeps } from "@/queue/workers/sweeper.worker";
import { listInvoiceEvents } from "@/repositories/invoiceEvents.repository";
import { findExpiredLeases, findStuckInvoices } from "@/repositories/invoices.repository";
import { claim } from "@/services/invoiceStatus.service";
import { logger } from "@/utils/logger";
import { seedTestFixtures } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";
import { createReadyInvoice, expireLease, getInvoice, startSendingAs } from "./helpers/invoices";

beforeAll(async () => {
  await seedTestFixtures();
});
beforeEach(async () => {
  await truncateInvoiceTables();
});
afterAll(async () => {
  await closeDb();
});

function monitorDeps(): SweeperDeps {
  return {
    db,
    invoices: { findStuck: findStuckInvoices, findExpiredLeases },
    status: { claim },
    pdfQueue: { add: vi.fn() as never },
    emailQueue: { add: vi.fn() as never },
    stuckTimeoutMs: 120_000,
    logger,
  };
}

describe("failExpiredLeases", () => {
  it("fails an EMAIL_SENDING invoice whose lease expired, saying delivery is unknown and where to check", async () => {
    const invoiceId = await createReadyInvoice();
    await startSendingAs(invoiceId, "email-dead-worker");
    await expireLease(invoiceId);

    expect(await failExpiredLeases(monitorDeps())).toBe(1);

    const invoice = await getInvoice(invoiceId);
    expect(invoice.status).toBe("FAILED");
    expect(invoice.lastError).toContain("UNKNOWN whether the email was delivered");
    expect(invoice.lastError).toContain(`v:invoice-id=${invoiceId}`);
    expect(invoice.claimToken).toBeNull();
    expect(invoice.leaseUntil).toBeNull();

    const events = await listInvoiceEvents(db, invoiceId);
    expect(events.at(-1)).toMatchObject({ fromStatus: "EMAIL_SENDING", toStatus: "FAILED" });
  });

  it("fails an expired PDF_RENDERING invoice as safe to retry", async () => {
    const invoiceId = await createReadyInvoice();
    await db.execute(
      sql`update invoices set status = 'PDF_RENDERING', claim_token = 'pdf-dead', lease_until = now() - interval '1 second' where id = ${invoiceId}`,
    );

    expect(await failExpiredLeases(monitorDeps())).toBe(1);

    const invoice = await getInvoice(invoiceId);
    expect(invoice.status).toBe("FAILED");
    expect(invoice.lastError).toContain("safe to retry");
  });

  it("never touches an invoice whose lease is still live", async () => {
    const invoiceId = await createReadyInvoice();
    await startSendingAs(invoiceId, "email-alive");

    expect(await failExpiredLeases(monitorDeps())).toBe(0);

    const invoice = await getInvoice(invoiceId);
    expect(invoice.status).toBe("EMAIL_SENDING");
    expect(invoice.claimToken).toBe("email-alive");
  });

  it("ignores invoices at rest", async () => {
    await createReadyInvoice();
    expect(await failExpiredLeases(monitorDeps())).toBe(0);
  });
});
