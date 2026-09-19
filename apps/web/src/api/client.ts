export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<TResponse, TBody>(path: string, body: TBody): Promise<TResponse>;
  delete(path: string): Promise<void>;
}

const REQUEST_TIMEOUT_MS = 20_000;

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

  return {
    get: <T>(path: string) => request<T>(path, { cache: "no-store" }),
    post: <TResponse, TBody>(path: string, body: TBody) =>
      request<TResponse>(path, { method: "POST", body: JSON.stringify(body) }),
    delete: (path: string) => request<void>(path, { method: "DELETE" }),
  };
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
