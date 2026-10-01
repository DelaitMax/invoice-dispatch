import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ZodError } from "zod";
import { AppError } from "@/utils/AppError";
import { logger } from "@/utils/logger";

interface ErrorResponseBody {
  error: {
    message: string;
    code?: string;
    details?: Record<string, string[] | undefined>;
  };
}

function isBodyParserSyntaxError(err: unknown): err is SyntaxError & { status?: number; type?: string } {
  return (
    err instanceof SyntaxError &&
    (err as { type?: string }).type === "entity.parse.failed" &&
    (err as { status?: number }).status === StatusCodes.BAD_REQUEST
  );
}

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    const body: ErrorResponseBody = { error: { message: err.message, ...(err.code ? { code: err.code } : {}) } };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ErrorResponseBody = {
      error: {
        message: "Validation failed",
        code: "VALIDATION_ERROR",
        details: err.flatten().fieldErrors,
      },
    };
    res.status(StatusCodes.BAD_REQUEST).json(body);
    return;
  }

  if (isBodyParserSyntaxError(err)) {
    const body: ErrorResponseBody = { error: { message: "Malformed JSON body", code: "INVALID_JSON" } };
    res.status(StatusCodes.BAD_REQUEST).json(body);
    return;
  }

  logger.error("Unexpected error", {
    requestId: req.requestId,
    error: err instanceof Error ? { message: err.message, stack: err.stack } : { value: err },
  });

  const body: ErrorResponseBody = { error: { message: "Internal server error" } };
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(body);
}

export function notFoundMiddleware(req: Request, res: Response): void {
  const body: ErrorResponseBody = {
    error: { message: `Route ${req.method} ${req.path} not found`, code: "NOT_FOUND" },
  };
  res.status(StatusCodes.NOT_FOUND).json(body);
}
