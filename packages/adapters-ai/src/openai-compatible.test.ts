import { describe, expect, it, vi } from "vitest";

import { OpenAiCompatibleChatModel } from "./openai-compatible";

const request = {
  messages: [{ role: "user" as const, content: "hello" }],
  temperature: 0.2,
  responseFormat: "json" as const,
};

describe("OpenAiCompatibleChatModel", () => {
  it("sends the compatible request shape, optional auth, and JSON mode", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: " answer " } }] })));
    const model = new OpenAiCompatibleChatModel({
      baseUrl: "http://model.example/v1/",
      model: "portable-model",
      apiKey: "secret-value",
      supportsJsonMode: true,
      fetch,
    });

    await expect(model.complete(request)).resolves.toBe("answer");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://model.example/v1/chat/completions");
    expect(init.headers).toEqual({ "content-type": "application/json", authorization: "Bearer secret-value" });
    expect(JSON.parse(init.body as string)).toEqual({
      model: "portable-model",
      messages: request.messages,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
  });

  it("merges extra headers into the request", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));
    const model = new OpenAiCompatibleChatModel({
      baseUrl: "http://model.example/v1",
      model: "m",
      apiKey: "secret-value",
      extraHeaders: { "x-app": "cvmaker" },
      fetch,
    });

    await model.complete(request);
    const init = fetch.mock.calls[0]![1];
    expect(init.headers).toEqual({ "content-type": "application/json", "x-app": "cvmaker", authorization: "Bearer secret-value" });
  });

  it("omits authorization and unsupported JSON mode", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));
    const model = new OpenAiCompatibleChatModel({ baseUrl: "http://localhost:11434/v1", model: "local", fetch });
    await model.complete(request);

    const init = fetch.mock.calls[0]![1];
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).not.toHaveProperty("response_format");
  });

  it("bounds upstream error text without exposing configuration", async () => {
    const fetch = vi.fn(async () => new Response("x".repeat(2_000), { status: 503 }));
    const model = new OpenAiCompatibleChatModel({ baseUrl: "http://model.example/v1", model: "m", apiKey: "never-print-me", fetch });

    const error = await model.complete(request).catch((value: unknown) => value as Error);
    expect(error.message).toContain("Chat model error 503");
    expect(error.message.length).toBeLessThan(1_100);
    expect(error.message).not.toContain("never-print-me");
  });

  it.each([
    ["malformed JSON", new Response("not-json"), "invalid JSON"],
    ["missing content", new Response(JSON.stringify({ choices: [{}] })), "no message content"],
  ])("rejects %s responses", async (_case, response, message) => {
    const model = new OpenAiCompatibleChatModel({
      baseUrl: "http://model.example/v1",
      model: "m",
      fetch: vi.fn(async () => response),
    });
    await expect(model.complete(request)).rejects.toThrow(message);
  });

  it("aborts requests at the configured timeout", async () => {
    const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const model = new OpenAiCompatibleChatModel({ baseUrl: "http://model.example/v1", model: "m", timeoutMs: 5, fetch });

    await expect(model.complete(request)).rejects.toThrow("timed out after 5ms");
    expect((fetch.mock.calls[0]![1]?.signal as AbortSignal).aborted).toBe(true);
  });
});