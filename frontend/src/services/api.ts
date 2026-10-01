import { createApi, fetchBaseQuery, type BaseQueryFn } from "@reduxjs/toolkit/query/react";
import type { FetchArgs, FetchBaseQueryError, FetchBaseQueryMeta } from "@reduxjs/toolkit/query/react";
import { showToast } from "@/features/toasts/toastSlice";

type ReactiveBaseQuery = BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError, object, FetchBaseQueryMeta>;

const QUIET_RETRY_CODES: ReadonlySet<string> = new Set(["PDF_NOT_READY", "INVOICE_NOT_RETRYABLE"]);
export const QUIET_RETRY_DELAY_MS = 2000;

function getRequestUrl(args: string | FetchArgs): string {
  return typeof args === "string" ? args : args.url;
}

function getErrorCode(error: FetchBaseQueryError): string | null {
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null || !("error" in data)) return null;
  const inner: unknown = data.error;
  if (typeof inner !== "object" || inner === null || !("code" in inner)) return null;
  return typeof inner.code === "string" ? inner.code : null;
}

export function parseRetryAfterSeconds(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const seconds = Number.parseInt(value, 10);
  return seconds > 0 ? seconds : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

//  - 401: invalidate CurrentUser → ProtectedRoute refetches /auth/me, gets 401, redirects to
//    /login. Any endpoint can 401 once the cookie expires — not just /auth/me — and without
//    this a JournalRow's poll would just spin against a dead session every 2s.
export function createReactiveBaseQuery(rawQuery: ReactiveBaseQuery): ReactiveBaseQuery {
  return async (args, apiInstance, extraOptions) => {
    let result = await rawQuery(args, apiInstance, extraOptions);

    if (result.error?.status === 409 && QUIET_RETRY_CODES.has(getErrorCode(result.error) ?? "")) {
      await delay(QUIET_RETRY_DELAY_MS);
      result = await rawQuery(args, apiInstance, extraOptions);
    }

    const { error } = result;
    if (!error) return result;

    if (error.status === 401) {
      apiInstance.dispatch(api.util.invalidateTags(["CurrentUser"]));
    } else if (error.status === 403 && getErrorCode(error) === "ADMIN_REQUIRED") {
      apiInstance.dispatch(showToast({ id: "admin-required", kind: "error", message: "Нужны права администратора" }));
    } else if (error.status === 429) {
      const seconds = parseRetryAfterSeconds(result.meta?.response?.headers.get("Retry-After"));
      const message = seconds
        ? `Слишком много запросов. Повторите через ${seconds} с.`
        : "Слишком много запросов. Попробуйте чуть позже.";
      apiInstance.dispatch(showToast({ id: "rate-limited", kind: "error", message }));
    } else if (
      (error.status === "FETCH_ERROR" || error.status === "TIMEOUT_ERROR") &&
      !getRequestUrl(args).startsWith("/health")
    ) {
      apiInstance.dispatch(
        showToast({
          id: "network",
          kind: "error",
          message: "Нет связи с сервером. Проверьте соединение.",
          action: "refetch",
        }),
      );
    }

    return result;
  };
}

const baseQueryWithReactions = createReactiveBaseQuery(fetchBaseQuery({ baseUrl: "", credentials: "include" }));

export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReactions,
  tagTypes: ["CurrentUser", "Invoice"],
  endpoints: () => ({}),
});
