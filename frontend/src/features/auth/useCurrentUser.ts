import { useGetCurrentUserQuery } from "@/features/auth/authApi";

// RTK Query keeps the last *successful* `data` after a refetch fails. For a session query that
// is wrong: once /auth/me answers 401, "the last user we saw" is not the current user. Anything
// that decides what to show or where to redirect must go through this instead of reading
// `data` directly.
export function useCurrentUser() {
  const { data, isLoading, isError } = useGetCurrentUserQuery();
  return { user: isError ? undefined : data, isLoading, isError };
}
