import { Router } from "express";
import { apiKeyMiddleware } from "@/middleware/apiKey.middleware";
import { createInvoiceRateLimiter } from "@/middleware/rateLimit.middleware";
import { asyncHandler } from "@/utils/asyncHandler";
import { createInvoiceHandler, getInvoiceHandler } from "@/controllers/invoices.controller";

export const invoicesRouter = Router();

invoicesRouter.use(apiKeyMiddleware);

invoicesRouter.post("/", createInvoiceRateLimiter, asyncHandler(createInvoiceHandler));
invoicesRouter.get("/:id", asyncHandler(getInvoiceHandler));
