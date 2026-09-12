import { describe, expect, it, vi } from "vitest";

import { OpenRouterChatModel } from "./openrouter";

const request = {
  messages: [{ role: "user" as const, content: "hello" }],
  temperature: 0.2,
};

describe("OpenRouterChatModel", () => {
  it("targets the OpenRouter endpoint with Bearer auth and no JSON mode by default", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));
    const model = new OpenRouterChatModel({ apiKey: "secret-value", model: "vendor/model", fetch });

    await model.complete({ ...request, responseFormat: "json" as const });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers).toEqual({ "content-type": "application/json", authorization: "Bearer secret-value" });
    expect(JSON.parse(init.body as string)).not.toHaveProperty("response_format");
  });

  it("requires an API key", () => {
    expect(() => new OpenRouterChatModel({ apiKey: "", model: "m" })).toThrow("OpenRouter API key is required");
  });

  it("sends attribution headers only when provided", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));

    const attributed = new OpenRouterChatModel({
      apiKey: "secret-value",
      model: "m",
      refererUrl: "https://nomcci.com/",
      appTitle: "CVMaker",
      supportsJsonMode: true,
      fetch,
    });
    await attributed.complete({ ...request, responseFormat: "json" as const });
    expect(fetch.mock.calls[0]![1].headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer secret-value",
      "HTTP-Referer": "https://nomcci.com/",
      "X-OpenRouter-Title": "CVMaker",
    });
    expect(JSON.parse(fetch.mock.calls[0]![1].body as string)).toEqual({
      model: "m",
      messages: request.messages,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const plain = new OpenRouterChatModel({ apiKey: "secret-value", model: "m", fetch });
    await plain.complete(request);
    expect(fetch.mock.calls[1]![1].headers).toEqual({ "content-type": "application/json", authorization: "Bearer secret-value" });
  });

  it("allows overriding the endpoint", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));
    const model = new OpenRouterChatModel({ apiKey: "secret-value", model: "m", baseUrl: "http://proxy.example/v1/", fetch });

    await model.complete(request);
    expect(fetch.mock.calls[0]![0]).toBe("http://proxy.example/v1/chat/completions");
  });
});