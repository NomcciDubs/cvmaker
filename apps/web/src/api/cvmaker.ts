import type { ApiClient } from "./client";
import type { SavedCvInput } from "@nomcci/cvmaker-domain";
import type { AdminMetrics, AiUsage, ApplicationRecord, ApplicationSnapshot, CvInputRecord, ExportPdfResponse, ImportCvRequest, ImportCvResponse, ImportImproveRequest, ModifyCvRequest, PdfArchiveItem, PdfQuotaSettings, PhotoRecord, RenderCvRequest, SavedCvRecord, SavedPhoto, Session } from "../types";

export interface AiProgress {
  phase: "generating" | "repairing" | "validating";
  characters: number;
  tokens?: number;
}

export interface AiStreamHandlers {
  onProgress?: (progress: AiProgress) => void;
  signal?: AbortSignal;
}

export class AiStreamError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AiStreamError";
  }
}

async function runAiStream<TDone>(client: ApiClient, path: string, body: unknown, handlers: AiStreamHandlers): Promise<TDone> {
  let result: TDone | undefined;
  let failureCode: string | undefined;
  await client.postEventStream(path, body, (event) => {
    if (event.event === "progress") {
      const data = parseJson(event.data) as AiProgress | null;
      if (data) handlers.onProgress?.(data);
    } else if (event.event === "done") {
      result = (parseJson(event.data) as TDone | null) ?? undefined;
    } else if (event.event === "error") {
      failureCode = (parseJson(event.data) as { code?: string } | null)?.code ?? "ai_error";
    }
  }, handlers.signal);
  if (failureCode) throw new AiStreamError(failureCode);
  if (result === undefined) throw new AiStreamError("ai_error");
  return result;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function createCvmakerApi(client: ApiClient) {
  return {
    loginForDevelopment: () => client.post<{ authenticated: boolean }, Record<string, never>>("/api/dev/login", {}),
    logoutForDevelopment: () => client.post<{ authenticated: boolean }, Record<string, never>>("/api/dev/logout", {}),
    getSession: () => client.get<Session>("/api/me"),
    renderCv: (body: RenderCvRequest) => client.post<{ html: string }, RenderCvRequest>("/api/cv/render", body),
    importCv: (body: ImportCvRequest) => client.post<ImportCvResponse, ImportCvRequest>("/api/cv/import", body),
    streamImportCv: (body: ImportCvRequest, handlers: AiStreamHandlers = {}) =>
      runAiStream<ImportCvResponse>(client, "/api/cv/import", body, handlers),
    modifyCv: (body: ModifyCvRequest) => client.post<{ cv: ModifyCvRequest["cv"] }, ModifyCvRequest>("/api/cv/modify", body),
    streamModifyCv: (body: ModifyCvRequest, handlers: AiStreamHandlers = {}) =>
      runAiStream<{ cv: ModifyCvRequest["cv"] }>(client, "/api/cv/modify", body, handlers),
    improveImportedCv: (body: ImportImproveRequest) =>
      client.post<{ cv: ModifyCvRequest["cv"]; importWorkflowId: null }, ImportImproveRequest>("/api/cv/import-improve", body),
    streamImproveImportedCv: (body: ImportImproveRequest, handlers: AiStreamHandlers = {}) =>
      runAiStream<{ cv: ModifyCvRequest["cv"]; importWorkflowId: null }>(client, "/api/cv/import-improve", body, handlers),
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
    getAdminMetrics: () => client.get<{ metrics: AdminMetrics }>("/api/admin/metrics"),
    getAiUsage: () => client.get<{ usage: AiUsage | null }>("/api/admin/ai-usage"),
    getPdfLimits: () => client.get<{ limits: PdfQuotaSettings }>("/api/admin/pdf-limits"),
    updatePdfLimits: (body: PdfQuotaSettings) =>
      client.post<{ limits: PdfQuotaSettings }, PdfQuotaSettings>("/api/admin/pdf-limits", body),
  };
}

export type CvmakerApi = ReturnType<typeof createCvmakerApi>;
