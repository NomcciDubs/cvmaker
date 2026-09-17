import type { ApiClient } from "./client";
import type { ImportCvRequest, ImportCvResponse, RenderCvRequest, Session } from "../types";

export function createCvmakerApi(client: ApiClient) {
  return {
    loginForDevelopment: () => client.post<{ authenticated: boolean }, Record<string, never>>("/api/dev/login", {}),
    getSession: () => client.get<Session>("/api/me"),
    renderCv: (body: RenderCvRequest) => client.post<{ html: string }, RenderCvRequest>("/api/cv/render", body),
    importCv: (body: ImportCvRequest) => client.post<ImportCvResponse, ImportCvRequest>("/api/cv/import", body),
    saveCvInput: (body: { name?: string; content: string }) =>
      client.post<{ id: string }, { name?: string; content: string }>("/api/cv-inputs", body),
  };
}

export type CvmakerApi = ReturnType<typeof createCvmakerApi>;
