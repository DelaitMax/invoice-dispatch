import { Router } from "express";
import { apiKeyMiddleware } from "@/middleware/apiKey.middleware";
import { requireAdmin, requireAuth } from "@/middleware/auth.middleware";
import { createInvoiceRateLimiter, createInvoiceUserRateLimiter } from "@/middleware/rateLimit.middleware";
import { asyncHandler } from "@/utils/asyncHandler";
import {
  createInvoiceHandler,
  getInvoiceHandler,
  getInvoicePdfHandler,
  retryInvoiceHandler,
} from "@/controllers/invoices.controller";

export const invoicesRouter = Router();

invoicesRouter.use(apiKeyMiddleware, requireAuth);

invoicesRouter.post("/", createInvoiceRateLimiter, createInvoiceUserRateLimiter, asyncHandler(createInvoiceHandler));
invoicesRouter.get("/:id", asyncHandler(getInvoiceHandler));
invoicesRouter.get("/:id/pdf", asyncHandler(getInvoicePdfHandler));
invoicesRouter.post("/:id/retry", requireAdmin, asyncHandler(retryInvoiceHandler));
