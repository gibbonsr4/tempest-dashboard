import { describe, it, expect } from "vitest";
import {
  TempestApiError,
  tempestErrorResponse,
} from "@/lib/tempest/server-client";

async function bodyOf(res: Response): Promise<{ error?: string }> {
  return (await res.json()) as { error?: string };
}

describe("tempestErrorResponse", () => {
  it("maps a 401 from upstream to 401", async () => {
    const res = tempestErrorResponse(new TempestApiError(401, "unauthorized"));
    expect(res.status).toBe(401);
    expect((await bodyOf(res)).error).toMatch(/401/);
  });

  it("maps a 404 (configuration miss) to 404", async () => {
    const res = tempestErrorResponse(
      new TempestApiError(404, "Station 99999 not found in your Tempest account"),
    );
    expect(res.status).toBe(404);
    expect((await bodyOf(res)).error).toMatch(/not found/);
  });

  it("maps a 500 (config) to 500", async () => {
    const res = tempestErrorResponse(
      new TempestApiError(500, "TEMPEST_TOKEN not configured"),
    );
    expect(res.status).toBe(500);
    expect((await bodyOf(res)).error).toMatch(/TEMPEST_TOKEN/);
  });

  it("maps unexpected upstream codes to 502 (bad gateway)", async () => {
    const res = tempestErrorResponse(new TempestApiError(429, "rate limited"));
    expect(res.status).toBe(502);
  });

  it("falls back to 500 for non-Tempest errors", async () => {
    const res = tempestErrorResponse(new Error("boom"));
    expect(res.status).toBe(500);
    expect((await bodyOf(res)).error).toBe("boom");
  });

  it("falls back to a generic message for thrown non-Errors", async () => {
    const res = tempestErrorResponse("not an error object");
    expect(res.status).toBe(500);
    expect((await bodyOf(res)).error).toBe("unknown error");
  });
});
