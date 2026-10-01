export interface MailAttachment {
  readonly filename: string;
  readonly content: Buffer;
  readonly contentType: string;
}

export interface OutgoingMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly attachment: MailAttachment;
  readonly tags?: string[];
  readonly variables?: Record<string, string>;
}

export interface SendResult {
  readonly messageId: string;
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<SendResult>;
}
