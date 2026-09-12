import { describe, expect, it, vi } from "vitest";

import { OpenAiChatModel } from "./openai";

const request = {
  messages: [{ role: "user" as const, content: "hello" }],
  temperature: 0.2,
};

describe("OpenAiChatModel", () => {
  it("targets the OpenAI endpoint with Bearer auth and JSON mode by default", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));
    const model = new OpenAiChatModel({ apiKey: "secret-value", model: "gpt-4.1-mini", fetch });

    await model.complete({ ...request, responseFormat: "json" as const });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers).toEqual({ "content-type": "application/json", authorization: "Bearer secret-value" });
    expect(JSON.parse(init.body as string)).toEqual({
      model: "gpt-4.1-mini",
      messages: request.messages,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
  });

  it("requires an API key", () => {
    expect(() => new OpenAiChatModel({ apiKey: "  ", model: "m" })).toThrow("OpenAI API key is required");
  });

  it("allows overriding the endpoint and JSON mode", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));
    const model = new OpenAiChatModel({
      apiKey: "secret-value",
      model: "m",
      baseUrl: "http://gateway.example/v1/",
      supportsJsonMode: false,
      fetch,
    });

    await model.complete({ ...request, responseFormat: "json" as const });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://gateway.example/v1/chat/completions");
    expect(JSON.parse(init.body as string)).not.toHaveProperty("response_format");
  });
});