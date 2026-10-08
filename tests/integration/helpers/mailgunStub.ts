import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type StubReaction = { readonly status: number; readonly body?: unknown } | "drop" | "hang";

export interface MailgunStub {
  readonly url: string;
  readonly requests: ReadonlyArray<{ readonly path: string; readonly body: string }>;
  close(): Promise<void>;
}

const OK_BODY = { id: "<stub-message-id@mg.example.com>", message: "Queued. Thank you." };

export async function startMailgunStub(script: ReadonlyArray<StubReaction> = []): Promise<MailgunStub> {
  const remaining = [...script];
  const requests: Array<{ path: string; body: string }> = [];
  const openSockets = new Set<import("node:net").Socket>();

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      requests.push({ path: req.url ?? "", body: Buffer.concat(chunks).toString("latin1") });
      const reaction = remaining.shift() ?? { status: 200, body: OK_BODY };

      if (reaction === "drop") {
        req.socket.destroy();
        return;
      }
      if (reaction === "hang") {
        return;
      }

      res.writeHead(reaction.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reaction.body ?? { message: `stub status ${reaction.status}` }));
    });
  });

  server.on("connection", (socket) => {
    openSockets.add(socket);
    socket.on("close", () => openSockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of openSockets) {
          socket.destroy();
        }
        server.close(() => resolve());
      }),
  };
}
