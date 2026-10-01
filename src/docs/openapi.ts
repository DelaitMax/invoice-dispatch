import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import type { Express, RequestHandler } from "express";
import swaggerUi from "swagger-ui-express";
import { registry } from "./registry";

export function buildDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "Invoice Dispatch API",
      version: "0.1.0",
      description:
        "Accepts invoices for existing clients, renders a PDF, and emails it. " +
        "/api/invoices/* requires a logged-in session (see /auth/*); an optional X-API-Key " +
        "header (set only when the server has API_KEY configured) is enforced on top of that, " +
        "not instead of it.",
    },
    servers: [{ url: "/", description: "Same origin as this docs page" }],
  });
}

export function mountDocs(app: Express): void {
  const document = buildDocument();

  app.get("/docs/openapi.json", (_req, res) => res.json(document));

  const relaxCsp: RequestHandler = (_req, res, next) => {
    res.removeHeader("Content-Security-Policy");
    next();
  };

  app.use("/docs", relaxCsp, swaggerUi.serve, swaggerUi.setup(document));
}
