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
}

export function createApiClient(apiBase = ""): ApiClient {
  const base = normalizeSameOriginBase(apiBase);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      ...init,
      credentials: "include",
      headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new ApiError(data.error ?? `Request failed (${response.status})`, response.status);
    return data as T;
  }

  return {
    get: <T>(path: string) => request<T>(path, { cache: "no-store" }),
    post: <TResponse, TBody>(path: string, body: TBody) =>
      request<TResponse>(path, { method: "POST", body: JSON.stringify(body) }),
  };
}

function normalizeSameOriginBase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    throw new Error("VITE_API_BASE must be a same-origin path");
  }
  return trimmed.replace(/\/$/, "");
}
