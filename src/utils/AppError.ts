import { StatusCodes } from "http-status-codes";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string | undefined;

  constructor(message: string, statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR, code?: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, code?: string): AppError {
    return new AppError(message, StatusCodes.BAD_REQUEST, code);
  }

  static unauthorized(message: string, code?: string): AppError {
    return new AppError(message, StatusCodes.UNAUTHORIZED, code);
  }

  static forbidden(message: string, code?: string): AppError {
    return new AppError(message, StatusCodes.FORBIDDEN, code);
  }

  static notFound(message: string, code?: string): AppError {
    return new AppError(message, StatusCodes.NOT_FOUND, code);
  }

  static conflict(message: string, code?: string): AppError {
    return new AppError(message, StatusCodes.CONFLICT, code);
  }

  static badGateway(message: string, code?: string): AppError {
    return new AppError(message, StatusCodes.BAD_GATEWAY, code);
  }
}
