import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createRegistrationGate } from "@/middleware/registration.middleware";
import { errorMiddleware } from "@/middleware/error.middleware";

function appWith(enabled: boolean) {
  const app = express();
  app.post(
    "/register",
    createRegistrationGate(() => enabled),
    (_req, res) => res.status(201).json({ ok: true }),
  );
  app.use(errorMiddleware);
  return app;
}

describe("createRegistrationGate", () => {
  it("lets the request through when registration is enabled", async () => {
    expect((await request(appWith(true)).post("/register")).status).toBe(201);
  });

  it("answers 403 REGISTRATION_DISABLED, without reaching the handler, when it is not", async () => {
    const response = await request(appWith(false)).post("/register");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("REGISTRATION_DISABLED");
  });
});
