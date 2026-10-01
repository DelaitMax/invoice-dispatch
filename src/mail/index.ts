import type { Env } from "@/config/env";
import { logger } from "@/utils/logger";
import { createConsoleMailer } from "./console.mailer";
import { createMailgunMailer } from "./mailgun.mailer";
import type { Mailer } from "./mailer";

export function createMailer(env: Env): Mailer {
  if (env.MAIL_DRIVER === "mailgun") {
    return createMailgunMailer({
      apiKey: env.MAILGUN_API_KEY,
      domain: env.MAILGUN_DOMAIN,
      baseUrl: env.MAILGUN_BASE_URL,
      fromName: env.MAIL_FROM_NAME,
      fromEmail: env.MAIL_FROM_EMAIL,
    });
  }

  return createConsoleMailer({ outboxDir: env.MAIL_OUTBOX_DIR, logger });
}

export type { Mailer, MailAttachment, OutgoingMail, SendResult } from "./mailer";
