import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchOrThrow } from "@/lib/hooks/_fetch";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

const mockFetch = (response: Response) => {
  globalThis.fetch = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("fetchOrThrow", () => {
  it("returns the parsed body on a 2xx", async () => {
    mockFetch(json(200, { ok: true, value: 42 }));
    const result = await fetchOrThrow<{ value: number }>("/api/x", "x");
    expect(result.value).toBe(42);
  });

  it("rethrows the proxy's `error` field verbatim on !ok", async () => {
    mockFetch(json(500, { error: "TEMPEST_TOKEN not configured" }));
    await expect(fetchOrThrow("/api/x", "x")).rejects.toThrow(
      "TEMPEST_TOKEN not configured",
    );
  });

  it("falls back to `<label> <status>` when the body has no error field", async () => {
    mockFetch(json(503, { something: "else" }));
    await expect(fetchOrThrow("/api/x", "observations")).rejects.toThrow(
      "observations 503",
    );
  });

  it("falls back to `<label> <status>` when the body isn't JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html>Bad Gateway</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    ) as unknown as typeof fetch;
    await expect(fetchOrThrow("/api/x", "alerts")).rejects.toThrow(
      "alerts 502",
    );
  });
});
