import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { citext } from "./customTypes";
import { companies } from "./companies";

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
