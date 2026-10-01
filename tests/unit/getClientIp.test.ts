import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { getClientIp } from "@/utils/getClientIp";

function fakeRequest(ip: string | undefined, remoteAddress: string | undefined, headers: Record<string, string> = {}) {
  return { ip, socket: { remoteAddress }, headers } as unknown as Request;
}

describe("getClientIp", () => {
  it("returns req.ip, ignoring any X-Forwarded-For header on the request (that header is attacker-controlled input, not a source of truth)", () => {
    const req = fakeRequest("10.0.0.5", undefined, { "x-forwarded-for": "6.6.6.6" });

    expect(getClientIp(req)).toBe("10.0.0.5");
  });

  it("falls back to the raw socket address when req.ip is unavailable (no trust proxy configured)", () => {
    const req = fakeRequest(undefined, "192.168.1.1");

    expect(getClientIp(req)).toBe("192.168.1.1");
  });

  it('falls back to "unknown" when neither req.ip nor the socket address is available', () => {
    const req = fakeRequest(undefined, undefined);

    expect(getClientIp(req)).toBe("unknown");
  });
});
