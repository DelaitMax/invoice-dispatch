import FormData from "form-data";
import Mailgun from "mailgun.js";
import type { Mailer, OutgoingMail, SendResult } from "./mailer";

export interface MailgunMailerConfig {
  readonly apiKey: string;
  readonly domain: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly fromName: string;
  readonly fromEmail: string;
}

export function createMailgunMailer(config: MailgunMailerConfig): Mailer {
  const client = new Mailgun(FormData).client({
    username: "api",
    key: config.apiKey,
    url: config.baseUrl,
    timeout: config.timeoutMs,
  });

  return {
    async send(mail: OutgoingMail): Promise<SendResult> {
      const variableFields = mail.variables
        ? Object.fromEntries(Object.entries(mail.variables).map(([key, value]) => [`v:${key}`, value]))
        : {};

      const result = await client.messages.create(config.domain, {
        from: `${config.fromName} <${config.fromEmail}>`,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        attachment: [{ data: mail.attachment.content, filename: mail.attachment.filename }],
        ...(mail.tags ? { "o:tag": mail.tags } : {}),
        ...variableFields,
      });

      return { messageId: result.id ?? "unknown" };
    },
  };
}
