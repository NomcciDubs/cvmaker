import type { ApiClient } from "./client";
import type { SavedCvInput } from "@nomcci/cvmaker-domain";
import type { CvInputRecord, ImportCvRequest, ImportCvResponse, ImportImproveRequest, ModifyCvRequest, RenderCvRequest, SavedCvRecord, Session } from "../types";

export function createCvmakerApi(client: ApiClient) {
  return {
    loginForDevelopment: () => client.post<{ authenticated: boolean }, Record<string, never>>("/api/dev/login", {}),
    getSession: () => client.get<Session>("/api/me"),
    renderCv: (body: RenderCvRequest) => client.post<{ html: string }, RenderCvRequest>("/api/cv/render", body),
    importCv: (body: ImportCvRequest) => client.post<ImportCvResponse, ImportCvRequest>("/api/cv/import", body),
    modifyCv: (body: ModifyCvRequest) => client.post<{ cv: ModifyCvRequest["cv"] }, ModifyCvRequest>("/api/cv/modify", body),
    improveImportedCv: (body: ImportImproveRequest) =>
      client.post<{ cv: ModifyCvRequest["cv"]; importWorkflowId: null }, ImportImproveRequest>("/api/cv/import-improve", body),
    saveCvInput: (body: { name?: string; content: string }) =>
      client.post<{ id: string }, { name?: string; content: string }>("/api/cv-inputs", body),
    listCvInputs: () => client.get<{ inputs: CvInputRecord[] }>("/api/cv-inputs"),
    listCvs: () => client.get<{ cvs: SavedCvRecord[] }>("/api/cvs"),
    saveCv: (body: SavedCvInput) => client.post<{ cv: SavedCvRecord }, SavedCvInput>("/api/cvs", body),
    deleteCv: (id: string) => client.delete(`/api/cvs/${encodeURIComponent(id)}`),
  };
}

export type CvmakerApi = ReturnType<typeof createCvmakerApi>;
