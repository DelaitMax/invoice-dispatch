export const ALLOWED_CURRENCIES = ["USD", "EUR", "GBP"] as const;

export const MAX_INVOICE_ITEMS = 50;
export const MAX_ITEM_DESCRIPTION_LENGTH = 500;
export const MAX_NOTES_LENGTH = 2000;
export const MIN_ITEM_QUANTITY = 1;
export const MAX_ITEM_QUANTITY = 10_000;
export const MIN_UNIT_AMOUNT_MINOR = 0;
export const MAX_AMOUNT_MINOR = 100_000_000_00;

export const MAX_EMAIL_LENGTH = 254;

export const INVOICE_NUMBER_PREFIX = "INV";
export const INVOICE_NUMBER_PAD_WIDTH = 6;

export const QUEUE_NAME_PDF = "invoice-pdf";
export const QUEUE_NAME_EMAIL = "invoice-email";

export const JOB_NAME_RENDER_PDF = "render";
export const JOB_NAME_SEND_EMAIL = "send";

/** How many finished jobs BullMQ keeps around per queue, for observability, before trimming. */
export const QUEUE_KEEP_COMPLETED_JOBS = 1_000;
export const QUEUE_KEEP_FAILED_JOBS = 5_000;

export const SWEEPER_BATCH_SIZE = 100;

export const REQUEST_BODY_LIMIT = "256kb";
