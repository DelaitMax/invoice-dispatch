import { customType } from "drizzle-orm/pg-core";

export const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
