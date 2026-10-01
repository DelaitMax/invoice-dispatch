/**
 * 400 — invalid address/parameters; 401/403 — bad key/domain; 404 — unknown domain; 406 —
 * address on the suppression list; 413 — attachment too large. None of these change on
 * retry, so retrying is pure wasted quota.
 */
const PERMANENT_STATUS = new Set([400, 401, 403, 404, 406, 413]);

function extractStatus(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

/** 429 and 5xx, plus anything without a recognizable HTTP status (network errors, timeouts),
 * are treated as temporary — worth retrying with backoff. */
export function isPermanentMailError(err: unknown): boolean {
  const status = extractStatus(err);
  return status !== undefined && PERMANENT_STATUS.has(status);
}
