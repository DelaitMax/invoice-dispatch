import { Router } from "express";
import { loginHandler, logoutHandler, meHandler, registerHandler } from "@/controllers/auth.controller";
import { requireAuth } from "@/middleware/auth.middleware";
import { registrationGate } from "@/middleware/registration.middleware";
import { authRateLimiter } from "@/middleware/rateLimit.middleware";
import { asyncHandler } from "@/utils/asyncHandler";

export const authRouter = Router();

authRouter.post("/register", registrationGate, authRateLimiter, asyncHandler(registerHandler));
authRouter.post("/login", authRateLimiter, asyncHandler(loginHandler));
authRouter.post("/logout", logoutHandler);
authRouter.get("/me", requireAuth, asyncHandler(meHandler));
