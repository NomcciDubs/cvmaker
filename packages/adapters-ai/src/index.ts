import type { ChatModel, ChatModelRequest } from "@nomcci/cvmaker-application";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ERROR_TEXT = 1_024;

export interface OpenAiCompatibleChatModelOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  supportsJsonMode?: boolean;
  fetch?: typeof globalThis.fetch;
}

export class OpenAiCompatibleChatModel implements ChatModel {
  private readonly endpoint: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly supportsJsonMode: boolean;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: OpenAiCompatibleChatModelOptions) {
    if (!options.baseUrl.trim()) throw new Error("AI base URL is required");
    if (!options.model.trim()) throw new Error("AI model is required");
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("AI timeout must be a positive number");

    this.endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    this.apiKey = options.apiKey?.trim() || undefined;
    this.timeoutMs = timeoutMs;
    this.supportsJsonMode = options.supportsJsonMode ?? false;
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (!fetchImplementation) throw new Error("A fetch implementation is required");
    this.fetch = fetchImplementation;
    this.model = options.model;
  }

  private readonly model: string;

  async complete(request: ChatModelRequest): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    try {
      const response = await this.fetch(this.endpoint, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: request.messages,
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          ...(request.responseFormat === "json" && this.supportsJsonMode
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
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
