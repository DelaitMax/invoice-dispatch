import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { ClaimLostError } from "@/services/claimLost.error";
import { sendInvoiceEmail } from "@/services/invoiceEmail.service";
import { seedTestFixtures } from "./fixtures";
import { truncateInvoiceTables } from "./helpers";
import { buildEmailDeps, createFakeMailer, createReadyInvoice, getInvoice } from "./helpers/invoices";

beforeAll(async () => {
  await seedTestFixtures();
});

beforeEach(async () => {
  await truncateInvoiceTables();
});

afterAll(async () => {
  await closeDb();
});

describe("pipeline.duplicate — the key test of this project", () => {
  it("running the same email job twice concurrently calls mailer.send exactly once", async () => {
    const invoiceId = await createReadyInvoice();
    const mailer = createFakeMailer();
    const deps = buildEmailDeps(mailer);

    const results = await Promise.allSettled([
      sendInvoiceEmail(invoiceId, false, deps),
      sendInvoiceEmail(invoiceId, false, deps),
    ]);

    expect(mailer.sent).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(ClaimLostError);
      }
    }
    expect((await getInvoice(invoiceId)).status).toBe("SENT");
  });

  it("also holds when the second call starts slightly after the first has already sent", async () => {
    const invoiceId = await createReadyInvoice();
    const mailer = createFakeMailer();
    const deps = buildEmailDeps(mailer);

    await sendInvoiceEmail(invoiceId, false, deps);
    await sendInvoiceEmail(invoiceId, false, deps);

    expect(mailer.sent).toHaveLength(1);
  });
});
