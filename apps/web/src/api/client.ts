export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface SseEvent {
  event: string;
  data: string;
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<TResponse, TBody>(path: string, body: TBody): Promise<TResponse>;
  delete(path: string): Promise<void>;
  postEventStream<TBody>(path: string, body: TBody, onEvent: (event: SseEvent) => void, signal?: AbortSignal): Promise<void>;
}

const REQUEST_TIMEOUT_MS = 20_000;
const STREAM_IDLE_TIMEOUT_MS = 25_000;

export function createApiClient(apiBase = ""): ApiClient {
  const base = normalizeApiBase(apiBase);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        credentials: "include",
        signal: controller.signal,
        headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new ApiError(data.error ?? `Request failed (${response.status})`, response.status);
      return data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("Request timed out", 0);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function postEventStream<TBody>(path: string, body: TBody, onEvent: (event: SseEvent) => void, signal?: AbortSignal): Promise<void> {
    const controller = new AbortController();
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => controller.abort();
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(abort, STREAM_IDLE_TIMEOUT_MS);
    };
    signal?.addEventListener("abort", abort, { once: true });

    try {
      const response = await fetch(`${base}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(data.error ?? `Request failed (${response.status})`, response.status);
      }
      if (!response.body) throw new ApiError("Streaming is not supported", 0);

      resetIdle();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        resetIdle();
        buffer += decoder.decode(value, { stream: true });
        let separator = buffer.indexOf("\n\n");
        while (separator >= 0) {
          const block = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          const parsed = parseSseBlock(block);
          if (parsed) onEvent(parsed);
          separator = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError(signal?.aborted ? "Request aborted" : "Stream stalled", 0);
      }
      throw error;
    } finally {
      clearTimeout(idleTimer);
      signal?.removeEventListener("abort", abort);
    }
  }

  return {
    get: <T>(path: string) => request<T>(path, { cache: "no-store" }),
    post: <TResponse, TBody>(path: string, body: TBody) =>
      request<TResponse>(path, { method: "POST", body: JSON.stringify(body) }),
    delete: (path: string) => request<void>(path, { method: "DELETE" }),
    postEventStream,
  };
}

function parseSseBlock(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) data.push(line.slice("data:".length).replace(/^ /, ""));
  }
  if (data.length === 0) return null;
  return { event, data: data.join("\n") };
}

function normalizeApiBase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed.replace(/\/$/, "");
  const absolute = parseAbsoluteApiBase(trimmed);
  if (absolute) return absolute;
  throw new Error("VITE_API_BASE must be a same-origin path or an absolute http(s) URL");
}

function parseAbsoluteApiBase(value: string): string | null {
  if (!/^https?:\/\//i.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, "")}`;
}
