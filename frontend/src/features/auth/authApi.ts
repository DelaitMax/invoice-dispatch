import { api } from "@/services/api";
import type { paths } from "@/types/api.generated";
import type { AuthUser } from "@/types/api";

type LoginCredentials = NonNullable<paths["/auth/login"]["post"]["requestBody"]>["content"]["application/json"];
type RegisterCredentials = NonNullable<paths["/auth/register"]["post"]["requestBody"]>["content"]["application/json"];

const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    getCurrentUser: build.query<AuthUser, void>({
      query: () => ({ url: "/auth/me" }),
      providesTags: ["CurrentUser"],
    }),
    login: build.mutation<AuthUser, LoginCredentials>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      invalidatesTags: ["CurrentUser"],
    }),
    register: build.mutation<AuthUser, RegisterCredentials>({
      query: (body) => ({ url: "/auth/register", method: "POST", body }),
      invalidatesTags: ["CurrentUser"],
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } catch {
          return;
        }
        dispatch(api.util.resetApiState());
      },
    }),
  }),
});

export const { useGetCurrentUserQuery, useLoginMutation, useRegisterMutation, useLogoutMutation } = authApi;
