import type { RequestHandler } from "express";
import { env } from "@/config/env";
import { AppError } from "@/utils/AppError";

export function createRegistrationGate(isEnabled: () => boolean = () => env.REGISTRATION_ENABLED): RequestHandler {
  return (_req, _res, next) => {
    if (!isEnabled()) {
      next(AppError.forbidden("Registration is disabled on this deployment", "REGISTRATION_DISABLED"));
      return;
    }
    next();
  };
}

export const registrationGate = createRegistrationGate();
