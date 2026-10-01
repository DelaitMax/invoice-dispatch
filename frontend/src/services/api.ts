import { createApi, fetchBaseQuery, type BaseQueryFn } from "@reduxjs/toolkit/query/react";
import type { FetchArgs, FetchBaseQueryError, FetchBaseQueryMeta } from "@reduxjs/toolkit/query/react";

const rawBaseQuery = fetchBaseQuery({ baseUrl: "", credentials: "include" });

// Any endpoint can 401 once the session cookie expires or is rejected — not just /auth/me.
// Without this, a JournalRow's poll (or the create-invoice mutation) just gets a 401 forever:
// getApiErrorCode only special-cases 404 there, so the row shows an infinite spinner and keeps
// polling a dead session every 2s. Invalidating CurrentUser here means every subscriber
// (ProtectedRoute, Layout's UserMenu) refetches /auth/me, gets 401 itself, and ProtectedRoute
// redirects to /login — the same one central reaction, instead of every call site having to
// special-case 401 for itself.
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError, object, FetchBaseQueryMeta> = async (
  args,
  apiInstance,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, apiInstance, extraOptions);
  if (result.error?.status === 401) {
    apiInstance.dispatch(api.util.invalidateTags(["CurrentUser"]));
  }
  return result;
};

export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["CurrentUser", "Invoice"],
  endpoints: () => ({}),
});
