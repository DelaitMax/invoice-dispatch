import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { env } from "@/config/env";
import * as schema from "./schema";

export type Database = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;

const queryClient = postgres(env.DATABASE_URL, { max: env.DATABASE_POOL_MAX });

export const db: Database = drizzle(queryClient, { schema });

export async function closeDb(): Promise<void> {
  await queryClient.end({ timeout: 5 });
}
