import type { ChatModel, ChatModelRequest, ChatModelStreamChunk } from "@nomcci/cvmaker-application";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const MAX_ERROR_TEXT = 1_024;

export interface OpenAiCompatibleChatModelOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  supportsJsonMode?: boolean;
  extraHeaders?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
}

export class OpenAiCompatibleChatModel implements ChatModel {
  private readonly endpoint: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly supportsJsonMode: boolean;
  private readonly extraHeaders: Record<string, string>;
  private readonly fetch: typeof globalThis.fetch;
  private readonly model: string;

  constructor(options: OpenAiCompatibleChatModelOptions) {
    if (!options.baseUrl.trim()) throw new Error("AI base URL is required");
    if (!options.model.trim()) throw new Error("AI model is required");
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("AI timeout must be a positive number");

    this.endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    this.apiKey = options.apiKey?.trim() || undefined;
    this.timeoutMs = timeoutMs;
    this.supportsJsonMode = options.supportsJsonMode ?? false;
    this.extraHeaders = options.extraHeaders ?? {};
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (!fetchImplementation) throw new Error("A fetch implementation is required");
    this.fetch = fetchImplementation;
    this.model = options.model;
  }

  async complete(request: ChatModelRequest): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = { "content-type": "application/json", ...this.extraHeaders };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    try {
      const response = await this.fetch(this.endpoint, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: this.requestBody(request),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, MAX_ERROR_TEXT);
        throw new Error(`Chat model error ${response.status}${detail ? `: ${detail}` : ""}`);
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new Error("Chat model returned invalid JSON");
      }
      const content = responseContent(data);
      if (!content) throw new Error("Chat model returned no message content");
      return content;
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`Chat model timed out after ${this.timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async *stream(request: ChatModelRequest): AsyncIterable<ChatModelStreamChunk> {
    const controller = new AbortController();
    const idleMs = Math.min(this.timeoutMs, DEFAULT_IDLE_TIMEOUT_MS);
    let abortReason: "idle" | "total" | null = null;
    let idleTimer = setTimeout(() => { abortReason = "idle"; controller.abort(); }, idleMs);
    const totalTimer = setTimeout(() => { abortReason = "total"; controller.abort(); }, this.timeoutMs);
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { abortReason = "idle"; controller.abort(); }, idleMs);
    };
    const headers: Record<string, string> = { "content-type": "application/json", ...this.extraHeaders };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    try {
      const response = await this.fetch(this.endpoint, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: this.requestBody(request, true),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, MAX_ERROR_TEXT);
        throw new Error(`Chat model error ${response.status}${detail ? `: ${detail}` : ""}`);
      }
      if (!response.body) throw new Error("Chat model returned no stream body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        resetIdle();
        buffer += decoder.decode(value, { stream: true });

        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).replace(/\r$/, "");
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
          if (!line.startsWith("data:")) continue;
          const payload = line.slice("data:".length).trim();
          if (!payload) continue;
          if (payload === "[DONE]") {
            finished = true;
            break;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }
          const chunk = streamChunk(parsed);
          if (chunk) yield chunk;
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        const waited = abortReason === "idle" ? idleMs : this.timeoutMs;
        throw new Error(`Chat model timed out after ${waited}ms${abortReason === "idle" ? " without data" : ""}`);
      }
      throw error;
    } finally {
      clearTimeout(idleTimer);
      clearTimeout(totalTimer);
    }
  }

  private requestBody(request: ChatModelRequest, stream = false): string {
    return JSON.stringify({
      model: this.model,
      messages: request.messages,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(stream ? { stream: true } : {}),
      ...(request.responseFormat === "json" && this.supportsJsonMode
        ? { response_format: { type: "json_object" } }
        : {}),
    });
  }
}

function streamChunk(data: unknown): ChatModelStreamChunk | null {
  if (!data || typeof data !== "object") return null;
  const choices = (data as { choices?: unknown }).choices;
  const usage = (data as { usage?: unknown }).usage;
  const tokens = usage && typeof usage === "object" && typeof (usage as { completion_tokens?: unknown }).completion_tokens === "number"
    ? (usage as { completion_tokens: number }).completion_tokens
    : undefined;

  let content = "";
  if (Array.isArray(choices)) {
    const delta = (choices[0] as { delta?: { content?: unknown } } | undefined)?.delta?.content;
    if (typeof delta === "string") content = delta;
  }
  if (!content && tokens === undefined) return null;
  return tokens === undefined ? { content } : { content, tokens };
}

function responseContent(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const first = choices[0];
  if (!first || typeof first !== "object") return "";
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content.trim() : "";
}