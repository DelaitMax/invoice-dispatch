import { beforeEach, describe, expect, it, vi } from "vitest";
import { claim, transition } from "@/services/invoiceStatus.service";
import type { Logger } from "@/utils/logger";

const { updateInvoiceStatusMock, findInvoiceByIdMock, insertInvoiceEventMock } = vi.hoisted(() => ({
  updateInvoiceStatusMock: vi.fn(),
  findInvoiceByIdMock: vi.fn(),
  insertInvoiceEventMock: vi.fn(),
}));

vi.mock("@/repositories/invoices.repository", () => ({
  updateInvoiceStatus: updateInvoiceStatusMock,
  findInvoiceById: findInvoiceByIdMock,
}));

vi.mock("@/repositories/invoiceEvents.repository", () => ({
  insertInvoiceEvent: insertInvoiceEventMock,
}));

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => fakeLogger()) };
}

function fakeDb() {
  const db = { transaction: (cb: (tx: unknown) => unknown) => cb(db) };
  return db as never;
}

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claim", () => {
  it("updates status and records an event for an allowed transition", async () => {
    const updatedRow = { id: INVOICE_ID, status: "PDF_RENDERING" };
    updateInvoiceStatusMock.mockResolvedValue(updatedRow);

    const result = await claim(fakeDb(), { logger: fakeLogger() }, INVOICE_ID, ["PENDING"], "PDF_RENDERING");

    expect(result).toBe(updatedRow);
    expect(updateInvoiceStatusMock).toHaveBeenCalledWith(
      expect.anything(),
      INVOICE_ID,
      ["PENDING"],
      "PDF_RENDERING",
      {},
      {},
    );
    expect(insertInvoiceEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ invoiceId: INVOICE_ID, fromStatus: "PENDING", toStatus: "PDF_RENDERING" }),
    );
  });

  it("passes from/to through unchanged for a self-transition request (ownership is decided in the repository, not here)", async () => {
    const updatedRow = { id: INVOICE_ID, status: "EMAIL_SENDING" };
    updateInvoiceStatusMock.mockResolvedValue(updatedRow);

    const result = await claim(
      fakeDb(),
      { logger: fakeLogger() },
      INVOICE_ID,
      ["PDF_READY", "EMAIL_SENDING"],
      "EMAIL_SENDING",
    );

    expect(result).toBe(updatedRow);
    expect(updateInvoiceStatusMock).toHaveBeenCalledWith(
      expect.anything(),
      INVOICE_ID,
      ["PDF_READY", "EMAIL_SENDING"],
      "EMAIL_SENDING",
      {},
      {},
    );
  });

  it("forwards claimToken / leaseMs through to the repository call", async () => {
    updateInvoiceStatusMock.mockResolvedValue({ id: INVOICE_ID, status: "EMAIL_SENDING" });
    const options = { claimToken: "email-abc", leaseMs: 120_000 };

    await claim(
      fakeDb(),
      { logger: fakeLogger() },
      INVOICE_ID,
      ["PDF_READY", "EMAIL_SENDING"],
      "EMAIL_SENDING",
      {},
      options,
    );

    expect(updateInvoiceStatusMock).toHaveBeenCalledWith(
      expect.anything(),
      INVOICE_ID,
      ["PDF_READY", "EMAIL_SENDING"],
      "EMAIL_SENDING",
      {},
      options,
    );
  });

  it("returns null instead of throwing when the row is not in the expected status (SENT -> FAILED must not silently overwrite SENT)", async () => {
    updateInvoiceStatusMock.mockResolvedValue(null);
    findInvoiceByIdMock.mockResolvedValue({ id: INVOICE_ID, status: "SENT" });
    const logger = fakeLogger();

    const result = await claim(fakeDb(), { logger }, INVOICE_ID, ["EMAIL_SENDING"], "FAILED");

    expect(result).toBeNull();
    expect(insertInvoiceEventMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "Invoice status transition rejected",
      expect.objectContaining({ invoiceId: INVOICE_ID, expected: ["EMAIL_SENDING"], actual: "SENT", target: "FAILED" }),
    );
  });

  it("passes patch fields through to the repository update", async () => {
    updateInvoiceStatusMock.mockResolvedValue({ id: INVOICE_ID, status: "SENT" });

    await claim(fakeDb(), { logger: fakeLogger() }, INVOICE_ID, ["EMAIL_SENDING"], "SENT", {
      sentAt: new Date("2026-01-01T00:00:00.000Z"),
      providerMessageId: "msg-1",
    });

    expect(updateInvoiceStatusMock).toHaveBeenCalledWith(
      expect.anything(),
      INVOICE_ID,
      ["EMAIL_SENDING"],
      "SENT",
      {
        sentAt: new Date("2026-01-01T00:00:00.000Z"),
        providerMessageId: "msg-1",
      },
      {},
    );
  });
});

describe("transition", () => {
  it("returns the updated row on success", async () => {
    const updatedRow = { id: INVOICE_ID, status: "PDF_READY" };
    updateInvoiceStatusMock.mockResolvedValue(updatedRow);

    const result = await transition(fakeDb(), { logger: fakeLogger() }, INVOICE_ID, ["PDF_RENDERING"], "PDF_READY");

    expect(result).toBe(updatedRow);
  });

  it("throws AppError(409, INVOICE_STATUS_CONFLICT) when the underlying claim is rejected", async () => {
    updateInvoiceStatusMock.mockResolvedValue(null);
    findInvoiceByIdMock.mockResolvedValue({ id: INVOICE_ID, status: "SENT" });

    await expect(
      transition(fakeDb(), { logger: fakeLogger() }, INVOICE_ID, ["FAILED"], "PENDING"),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "INVOICE_STATUS_CONFLICT",
    });
  });
});
