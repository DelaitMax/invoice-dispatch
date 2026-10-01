import express, { type Express } from "express";
import helmet from "helmet";
import { env } from "@/config/env";
import { REQUEST_BODY_LIMIT } from "@/constants";
import { mountDocs } from "@/docs/openapi";
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

  if (env.DOCS_ENABLED) {
    mountDocs(app);
  }

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
