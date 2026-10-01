import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/queue/pdfQueue", () => ({
  pdfQueue: { add: vi.fn(async () => ({}) as never) },
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("Swagger docs", () => {
  it("DOCS_ENABLED=false -> /docs is a plain 404, not mounted at all", async () => {
    process.env["DOCS_ENABLED"] = "false";

    const { createApp } = await import("@/app");
    const app = createApp();

    const response = await request(app).get("/docs/");

    expect(response.status).toBe(404);
  });

  it("DOCS_ENABLED=true -> /docs serves the Swagger UI page", async () => {
    process.env["DOCS_ENABLED"] = "true";

    const { createApp } = await import("@/app");
    const app = createApp();

    const response = await request(app).get("/docs/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Swagger UI");
  });
});
