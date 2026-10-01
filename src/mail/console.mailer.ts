import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "@/utils/logger";
import { maskEmail } from "@/utils/maskEmail";
import type { Mailer, OutgoingMail, SendResult } from "./mailer";

export interface ConsoleMailerConfig {
  readonly outboxDir: string;
  readonly logger: Logger;
}

export function createConsoleMailer(config: ConsoleMailerConfig): Mailer {
  mkdirSync(config.outboxDir, { recursive: true });

  return {
    async send(mail: OutgoingMail): Promise<SendResult> {
      const messageId = `console-${randomUUID()}`;

      const metadata = {
        messageId,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        tags: mail.tags ?? [],
        variables: mail.variables ?? {},
        attachmentFilename: mail.attachment.filename,
      };

      writeFileSync(join(config.outboxDir, `${messageId}.json`), JSON.stringify(metadata, null, 2));
      writeFileSync(join(config.outboxDir, `${messageId}.html`), mail.html);
      writeFileSync(join(config.outboxDir, `${messageId}-${mail.attachment.filename}`), mail.attachment.content);

      config.logger.info("Console mailer: email sent", {
        to: maskEmail(mail.to),
        subject: mail.subject,
        messageId,
        outboxDir: config.outboxDir,
      });

      return { messageId };
    },
  };
}
