import type { ApiClient } from "./client";
import type { RenderCvRequest, Session } from "../types";

export function createCvmakerApi(client: ApiClient) {
  return {
    loginForDevelopment: () => client.post<{ authenticated: boolean }, Record<string, never>>("/api/dev/login", {}),
    getSession: () => client.get<Session>("/api/me"),
    renderCv: (body: RenderCvRequest) => client.post<{ html: string }, RenderCvRequest>("/api/cv/render", body),
  };
}

export type CvmakerApi = ReturnType<typeof createCvmakerApi>;
