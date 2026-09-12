import { OpenAiCompatibleChatModel, type OpenAiCompatibleChatModelOptions } from "./openai-compatible";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export interface OpenAiChatModelOptions extends Omit<OpenAiCompatibleChatModelOptions, "baseUrl" | "apiKey"> {
  baseUrl?: string;
  apiKey: string;
}

export class OpenAiChatModel extends OpenAiCompatibleChatModel {
  constructor(options: OpenAiChatModelOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new Error("OpenAI API key is required");
    super({
      baseUrl: options.baseUrl?.trim() || DEFAULT_BASE_URL,
      model: options.model,
      apiKey,
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.supportsJsonMode === undefined ? { supportsJsonMode: true } : { supportsJsonMode: options.supportsJsonMode }),
      ...(options.extraHeaders === undefined ? {} : { extraHeaders: options.extraHeaders }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
  }
}