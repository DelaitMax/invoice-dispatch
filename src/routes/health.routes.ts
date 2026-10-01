import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { db } from "@/db/client";
import { redisClient } from "@/lib/redis";
import { checkReadiness } from "@/services/health.service";
import { asyncHandler } from "@/utils/asyncHandler";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.status(StatusCodes.OK).json({ status: "ok", timestamp: new Date().toISOString() });
});

healthRouter.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    const result = await checkReadiness(db, redisClient);
    const statusCode = result.status === "ok" ? StatusCodes.OK : StatusCodes.SERVICE_UNAVAILABLE;
    res.status(statusCode).json(result);
  }),
);
