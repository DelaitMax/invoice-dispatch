import type { Express } from "express";
import { authRouter } from "./auth.routes";
import { healthRouter } from "./health.routes";
import { invoicesRouter } from "./invoices.routes";

export function registerRoutes(app: Express): void {
  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/api/invoices", invoicesRouter);
}
