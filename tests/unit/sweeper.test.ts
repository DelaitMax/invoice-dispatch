import { beforeEach, describe, expect, it, vi } from "vitest";
import { sweepStuckInvoices, type SweeperDeps } from "@/queue/workers/sweeper.worker";
import type { Logger } from "@/utils/logger";

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => fakeLogger()) };
}

function buildDeps(overrides: Partial<SweeperDeps> = {}): SweeperDeps {
  return {
    db: {} as never,
    invoices: { findStuck: vi.fn(async () => []), findExpiredLeases: vi.fn(async () => []) },
    status: { claim: vi.fn(async () => null) },
    pdfQueue: { add: vi.fn(async () => undefined as never) },
    emailQueue: { add: vi.fn(async () => undefined as never) },
    stuckTimeoutMs: 120_000,
    logger: fakeLogger(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe("sweepStuckInvoices", () => {
  it("queries for stuck PENDING/PDF_READY invoices only — PDF_RENDERING/EMAIL_SENDING are a live worker's job, not the sweeper's", async () => {
    const findStuck = vi.fn(async () => []);
    const deps = buildDeps({ invoices: { findStuck, findExpiredLeases: vi.fn(async () => []) } });

    await sweepStuckInvoices(deps);

    expect(findStuck).toHaveBeenCalledWith(deps.db, expect.objectContaining({ statuses: ["PENDING", "PDF_READY"] }));
  });

  it("re-enqueues a stuck PENDING invoice onto the PDF queue, not the email queue", async () => {
    const invoice = { id: "11111111-1111-4111-8111-111111111111", status: "PENDING" as const };
    const deps = buildDeps({
      invoices: { findStuck: vi.fn(async () => [invoice] as never), findExpiredLeases: vi.fn(async () => []) },
    });

    const count = await sweepStuckInvoices(deps);

    expect(count).toBe(1);
    expect(deps.pdfQueue.add).toHaveBeenCalledWith("render", { invoiceId: invoice.id }, { jobId: `pdf-${invoice.id}` });
    expect(deps.emailQueue.add).not.toHaveBeenCalled();
  });

  it("re-enqueues a stuck PDF_READY invoice onto the email queue, not the PDF queue", async () => {
    const invoice = { id: "22222222-2222-4222-8222-222222222222", status: "PDF_READY" as const };
    const deps = buildDeps({
      invoices: { findStuck: vi.fn(async () => [invoice] as never), findExpiredLeases: vi.fn(async () => []) },
    });

    const count = await sweepStuckInvoices(deps);

    expect(count).toBe(1);
    expect(deps.emailQueue.add).toHaveBeenCalledWith(
      "send",
      { invoiceId: invoice.id },
      { jobId: `email-${invoice.id}` },
    );
    expect(deps.pdfQueue.add).not.toHaveBeenCalled();
  });

  it("keeps sweeping the rest of the batch when one invoice's re-enqueue throws, and logs the failure", async () => {
    const failing = { id: "33333333-3333-4333-8333-333333333333", status: "PENDING" as const };
    const ok = { id: "44444444-4444-4444-8444-444444444444", status: "PDF_READY" as const };
    const logger = fakeLogger();
    const deps = buildDeps({
      invoices: { findStuck: vi.fn(async () => [failing, ok] as never), findExpiredLeases: vi.fn(async () => []) },
      pdfQueue: { add: vi.fn(async () => Promise.reject(new Error("redis unavailable"))) },
      logger,
    });

    const count = await sweepStuckInvoices(deps);

    expect(count).toBe(2);
    expect(deps.emailQueue.add).toHaveBeenCalledWith("send", { invoiceId: ok.id }, { jobId: `email-${ok.id}` });
    expect(logger.error).toHaveBeenCalledWith(
      "Sweeper failed to re-enqueue a stuck invoice",
      expect.objectContaining({ invoiceId: failing.id, status: "PENDING" }),
    );
  });

  it("does nothing and returns 0 when no invoices are stuck", async () => {
    const deps = buildDeps();

    const count = await sweepStuckInvoices(deps);

    expect(count).toBe(0);
    expect(deps.pdfQueue.add).not.toHaveBeenCalled();
    expect(deps.emailQueue.add).not.toHaveBeenCalled();
    expect(deps.logger.warn).not.toHaveBeenCalled();
  });
});
