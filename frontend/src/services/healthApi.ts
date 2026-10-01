import { api } from "@/services/api";

interface ReadinessResponse {
  status: "ok" | "error";
  components: { database: "ok" | "error"; redis: "ok" | "error" };
}

const healthApi = api.injectEndpoints({
  endpoints: (build) => ({
    getReadiness: build.query<ReadinessResponse, void>({
      query: () => ({ url: "/health/ready" }),
    }),
  }),
});

export const { useGetReadinessQuery } = healthApi;

export function useIsServiceUnavailable(): boolean {
  const { data, isError } = useGetReadinessQuery(undefined, { pollingInterval: 30_000 });
  return isError || data?.status === "error";
}
