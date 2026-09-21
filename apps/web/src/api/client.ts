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

export interface StreamHandlers {
  onEvent: (event: SseEvent) => void;
  /** Fired once the stream has been idle long enough to warn the user. */
  onStall?: () => void;
  signal?: AbortSignal;
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<TResponse, TBody>(path: string, body: TBody): Promise<TResponse>;
  delete(path: string): Promise<void>;
  postEventStream<TBody>(path: string, body: TBody, handlers: StreamHandlers): Promise<void>;
}

const REQUEST_TIMEOUT_MS = 20_000;
/** Warning shown in the loader after this long without any progress event. */
export const STREAM_IDLE_WARNING_MS = 15_000;
/** Hard failure after this long without any progress event. */
export const STREAM_IDLE_TIMEOUT_MS = 30_000;
/** Hard failure for a stream that keeps talking but never finishes. */
export const STREAM_TOTAL_TIMEOUT_MS = 120_000;

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

  async function postEventStream<TBody>(path: string, body: TBody, handlers: StreamHandlers): Promise<void> {
    const controller = new AbortController();
    const external = handlers.signal;
    const abort = () => controller.abort();
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener("abort", abort, { once: true });
    }

    let stalled = false;
    let timedOut = false;
    let warningTimer: ReturnType<typeof setTimeout> | undefined;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const totalTimer = setTimeout(() => { timedOut = true; controller.abort(); }, STREAM_TOTAL_TIMEOUT_MS);

    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    void aborted.catch(() => undefined);

    const resetIdle = () => {
      clearTimeout(warningTimer);
      clearTimeout(idleTimer);
      warningTimer = setTimeout(() => handlers.onStall?.(), STREAM_IDLE_WARNING_MS);
      idleTimer = setTimeout(() => { stalled = true; controller.abort(); }, STREAM_IDLE_TIMEOUT_MS);
    };

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
        const { value, done } = await Promise.race([reader.read(), aborted]);
        if (done) break;
        resetIdle();
        buffer += decoder.decode(value, { stream: true });
        let separator = buffer.indexOf("\n\n");
        while (separator >= 0) {
          const block = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          const parsed = parseSseBlock(block);
          if (parsed) handlers.onEvent(parsed);
          separator = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        if (timedOut) throw new ApiError("ai_timeout", 0);
        if (stalled) throw new ApiError("ai_stalled", 0);
        throw new ApiError(external?.aborted ? "Request aborted" : "Stream stalled", 0);
      }
      throw error;
    } finally {
      clearTimeout(warningTimer);
      clearTimeout(idleTimer);
      clearTimeout(totalTimer);
      external?.removeEventListener("abort", abort);
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
