import { describe, expect, it, vi } from "vitest";
import { startWorkers, stopWorkers, type BootstrapWorkersDeps } from "@/queue/bootstrap";
import type { Logger } from "@/utils/logger";

const {
  launchBrowserMock,
  browserCloseMock,
  pdfQueueCloseMock,
  emailQueueCloseMock,
  createPdfWorkerMock,
  pdfWorkerCloseMock,
  createEmailWorkerMock,
  emailWorkerCloseMock,
  startSweeperMock,
  sweeperStopMock,
} = vi.hoisted(() => ({
  launchBrowserMock: vi.fn(),
  browserCloseMock: vi.fn(async () => undefined),
  pdfQueueCloseMock: vi.fn(async () => undefined),
  emailQueueCloseMock: vi.fn(async () => undefined),
  createPdfWorkerMock: vi.fn(),
  pdfWorkerCloseMock: vi.fn(async () => undefined),
  createEmailWorkerMock: vi.fn(),
  emailWorkerCloseMock: vi.fn(async () => undefined),
  startSweeperMock: vi.fn(),
  sweeperStopMock: vi.fn(),
}));

vi.mock("@/pdf/browser", () => ({ launchBrowser: launchBrowserMock }));
vi.mock("@/queue/pdfQueue", () => ({ pdfQueue: { close: pdfQueueCloseMock } }));
vi.mock("@/queue/emailQueue", () => ({ emailQueue: { close: emailQueueCloseMock } }));
vi.mock("@/queue/workers/pdf.worker", () => ({ createPdfWorker: createPdfWorkerMock }));
vi.mock("@/queue/workers/email.worker", () => ({ createEmailWorker: createEmailWorkerMock }));
vi.mock("@/queue/workers/sweeper.worker", () => ({ startSweeper: startSweeperMock }));

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => fakeLogger()) };
}

function fakeDeps(): BootstrapWorkersDeps {
  return {
    db: {} as never,
    invoices: {} as never,
    items: {} as never,
    documents: {} as never,
    status: {} as never,
    mailer: {} as never,
    sender: {} as never,
    logger: fakeLogger(),
  };
}

describe("stopWorkers", () => {
  it("closes every resource startWorkers opened -- pdfWorker, emailWorker, the sweeper, and both pdfQueue's and emailQueue's own Redis connections -- so the worker process has nothing left open to block a clean shutdown", async () => {
    launchBrowserMock.mockResolvedValue({ close: browserCloseMock });
    createPdfWorkerMock.mockReturnValue({ close: pdfWorkerCloseMock });
    createEmailWorkerMock.mockReturnValue({ close: emailWorkerCloseMock });
    startSweeperMock.mockReturnValue({ stop: sweeperStopMock });

    const handles = await startWorkers(fakeDeps());
    await stopWorkers(handles);

    expect(sweeperStopMock).toHaveBeenCalled();
    expect(pdfWorkerCloseMock).toHaveBeenCalled();
    expect(emailWorkerCloseMock).toHaveBeenCalled();
    expect(pdfQueueCloseMock).toHaveBeenCalled();
    expect(emailQueueCloseMock).toHaveBeenCalled();
    expect(browserCloseMock).toHaveBeenCalled();
  });
});
