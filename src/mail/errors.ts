export type MailErrorKind = "permanent" | "configuration" | "temporary";

const PERMANENT_STATUS = new Set([400, 406, 413]);

const CONFIGURATION_STATUS = new Set([401, 403, 404]);

const TRANSPORT_CODE = /^(E[A-Z0-9_]+|ERR_[A-Z0-9_]+)$/;
const AXIOS_HTTP_STATUS_CODES = new Set(["ERR_BAD_REQUEST", "ERR_BAD_RESPONSE"]);

function readStatus(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function readMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

export function isNoResponseError(err: unknown): boolean {
  if (readStatus(err) !== 400) {
    return false;
  }
  const message = readMessage(err);
  return message === "" || (TRANSPORT_CODE.test(message) && !AXIOS_HTTP_STATUS_CODES.has(message));
}

export function classifyMailError(err: unknown): MailErrorKind {
  if (isNoResponseError(err)) {
    return "temporary";
  }

  const status = readStatus(err);
  if (status === undefined) {
    return "temporary";
  }
  if (CONFIGURATION_STATUS.has(status)) {
    return "configuration";
  }
  if (PERMANENT_STATUS.has(status)) {
    return "permanent";
  }
  return "temporary";
}

export class MailConfigurationError extends Error {
  constructor(
    readonly httpStatus: number | undefined,
    detail: string,
  ) {
    super(`Mail provider rejected the request for a configuration reason (HTTP ${httpStatus ?? "?"}): ${detail}`);
    this.name = "MailConfigurationError";
  }
}
