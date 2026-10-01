import type { Express } from "express";
import { invoicesRouter } from "./invoices.routes";

export function registerRoutes(app: Express): void {
  app.use("/api/invoices", invoicesRouter);
}
