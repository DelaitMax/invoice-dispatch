import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { classifyMailError, isNoResponseError, type MailErrorKind } from "@/mail/errors";
import { createMailgunMailer } from "@/mail/mailgun.mailer";
import type { OutgoingMail } from "@/mail/mailer";
import { startMailgunStub, type MailgunStub, type StubReaction } from "./helpers/mailgunStub";

const MAIL: OutgoingMail = {
  to: "client@example.com",
  subject: "Invoice",
  text: "t",
  html: "<p>t</p>",
  attachment: { filename: "inv.pdf", content: Buffer.from("%PDF-"), contentType: "application/pdf" },
};

let stub: MailgunStub | undefined;

afterEach(async () => {
  await stub?.close();
  stub = undefined;
});

async function failureFor(reaction: StubReaction, timeoutMs = 2_000): Promise<unknown> {
  stub = await startMailgunStub([reaction]);
  const mailer = createMailgunMailer({
    apiKey: "key-test",
    domain: "mg.example.com",
    baseUrl: stub.url,
    timeoutMs,
    fromName: "Test",
    fromEmail: "test@example.com",
  });
  try {
    await mailer.send(MAIL);
  } catch (err) {
    return err;
  }
  throw new Error("expected the send to fail");
}

async function unreachableUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return `http://127.0.0.1:${port}`;
}

describe("a server that answered", () => {
  it.each<[number, MailErrorKind]>([
    [400, "permanent"],
    [406, "permanent"],
    [413, "permanent"],
    [401, "configuration"],
    [403, "configuration"],
    [404, "configuration"],
    [429, "temporary"],
    [500, "temporary"],
    [502, "temporary"],
    [503, "temporary"],
  ])("HTTP %i -> %s", async (status, expected) => {
    const err = await failureFor({ status, body: { message: "from mailgun" } });

    expect(classifyMailError(err)).toBe(expected);
    expect(isNoResponseError(err)).toBe(false);
  });

  it("a genuine 400 carries the HTTP reason phrase in `message` — that is what separates it from a network failure", async () => {
    const err = await failureFor({ status: 400, body: { message: "to parameter is not a valid address" } });

    expect(err).toMatchObject({ status: 400, message: "Bad Request", details: "to parameter is not a valid address" });
  });
});

describe("no HTTP response at all — the library still says status 400", () => {
  it("a connection reset mid-request is temporary, not a permanent 400", async () => {
    const err = await failureFor("drop");

    expect(err).toMatchObject({ status: 400, message: "ECONNRESET" });
    expect(isNoResponseError(err)).toBe(true);
    expect(classifyMailError(err)).toBe("temporary");
  });

  it("a refused connection is temporary", async () => {
    const mailer = createMailgunMailer({
      apiKey: "key-test",
      domain: "mg.example.com",
      baseUrl: await unreachableUrl(),
      timeoutMs: 2_000,
      fromName: "Test",
      fromEmail: "test@example.com",
    });

    const err = await mailer.send(MAIL).catch((e: unknown) => e);

    expect(err).toMatchObject({ status: 400, message: "ECONNREFUSED" });
    expect(classifyMailError(err)).toBe("temporary");
  });

  it("an unresolvable host is temporary", async () => {
    const mailer = createMailgunMailer({
      apiKey: "key-test",
      domain: "mg.example.com",
      baseUrl: "http://mailgun-does-not-resolve.invalid",
      timeoutMs: 5_000,
      fromName: "Test",
      fromEmail: "test@example.com",
    });

    const err = await mailer.send(MAIL).catch((e: unknown) => e);

    expect(classifyMailError(err)).toBe("temporary");
  });

  it("a hung upstream is cut off by the HTTP timeout (it used to hold the worker slot forever) and is temporary", async () => {
    const started = Date.now();
    const err = await failureFor("hang", 300);

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(err).toMatchObject({ status: 400, message: "ECONNABORTED" });
    expect(classifyMailError(err)).toBe("temporary");
  });
});
