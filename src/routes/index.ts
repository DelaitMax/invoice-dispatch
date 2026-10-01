import type { Express } from "express";
import { healthRouter } from "./health.routes";
import { invoicesRouter } from "./invoices.routes";

export function registerRoutes(app: Express): void {
  app.use("/health", healthRouter);
  app.use("/api/invoices", invoicesRouter);
}
