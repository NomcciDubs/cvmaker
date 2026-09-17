import type { ApiClient } from "./client";
import type { SavedCvInput } from "@nomcci/cvmaker-domain";
import type { ApplicationRecord, ApplicationSnapshot, CvInputRecord, ExportPdfResponse, ImportCvRequest, ImportCvResponse, ImportImproveRequest, ModifyCvRequest, PdfArchiveItem, PhotoRecord, RenderCvRequest, SavedCvRecord, SavedPhoto, Session } from "../types";

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
    listPhotos: () => client.get<{ photos: PhotoRecord[] }>("/api/photos"),
    uploadPhoto: (body: { name?: string; dataUrl: string }) =>
      client.post<SavedPhoto, { name?: string; dataUrl: string }>("/api/photos", body),
    deletePhoto: (id: string) => client.delete(`/api/photos/${encodeURIComponent(id)}`),
    exportPdf: (body: RenderCvRequest & { name?: string }) =>
      client.post<ExportPdfResponse, RenderCvRequest & { name?: string }>("/api/cv/pdf", body),
    listArchives: () => client.get<{ archives: PdfArchiveItem[] }>("/api/archives"),
    deleteArchive: (id: string) => client.delete(`/api/archives/${encodeURIComponent(id)}`),
    listApplications: () => client.get<{ applications: ApplicationRecord[] }>("/api/applications"),
    trackApplication: (body: ApplicationSnapshot) =>
      client.post<{ id: string }, ApplicationSnapshot>("/api/applications", body),
  };
}

export type CvmakerApi = ReturnType<typeof createCvmakerApi>;
