import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createApiClient", () => {
  it("prefixes requests with an absolute https base and keeps credentials", async () => {
    const fetchMock = mockFetch();
    const client = createApiClient("https://cvmaker-api.nomcci.com/");

    await client.get<{ ok: boolean }>("/api/me");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cvmaker-api.nomcci.com/api/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("keeps same-origin path bases working", async () => {
    const fetchMock = mockFetch();
    const client = createApiClient("/proxy");

    await client.get("/api/me");

    expect(fetchMock).toHaveBeenCalledWith("/proxy/api/me", expect.objectContaining({ credentials: "include" }));
  });

  it("rejects non-http bases", () => {
    expect(() => createApiClient("ftp://example.com")).toThrow("VITE_API_BASE");
    expect(() => createApiClient("//example.com/api")).toThrow("VITE_API_BASE");
    expect(() => createApiClient("not a url")).toThrow("VITE_API_BASE");
    expect(() => createApiClient("https://example.com/api?token=x")).toThrow("VITE_API_BASE");
  });
});
