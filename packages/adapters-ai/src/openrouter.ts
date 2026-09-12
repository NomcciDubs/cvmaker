import { OpenAiCompatibleChatModel, type OpenAiCompatibleChatModelOptions } from "./openai-compatible";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterChatModelOptions extends Omit<OpenAiCompatibleChatModelOptions, "baseUrl" | "apiKey" | "extraHeaders"> {
  baseUrl?: string;
  apiKey: string;
  refererUrl?: string;
  appTitle?: string;
}

export class OpenRouterChatModel extends OpenAiCompatibleChatModel {
  constructor(options: OpenRouterChatModelOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new Error("OpenRouter API key is required");

    const extraHeaders: Record<string, string> = {};
    const refererUrl = options.refererUrl?.trim();
    const appTitle = options.appTitle?.trim();
    if (refererUrl) extraHeaders["HTTP-Referer"] = refererUrl;
    if (appTitle) extraHeaders["X-OpenRouter-Title"] = appTitle;

    super({
      baseUrl: options.baseUrl?.trim() || DEFAULT_BASE_URL,
      model: options.model,
      apiKey,
      extraHeaders,
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.supportsJsonMode === undefined ? {} : { supportsJsonMode: options.supportsJsonMode }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
  }
}