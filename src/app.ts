import express, { type Express } from "express";
import helmet from "helmet";
import { REQUEST_BODY_LIMIT } from "@/constants";
import { errorMiddleware, notFoundMiddleware } from "@/middleware/error.middleware";
import { requestLoggerMiddleware } from "@/middleware/logger.middleware";
import { registerRoutes } from "@/routes";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(requestLoggerMiddleware);
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  registerRoutes(app);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
