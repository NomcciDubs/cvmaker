import type {
  ApplicationInput,
  CvData,
  CvLanguage,
  CvStyle,
  PdfQuotaSettings,
  Principal,
  RenderOptions,
  SavedCvInput,
} from "@nomcci/cvmaker-domain";

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(): string;
}

export interface ContentHasher {
  hash(value: string | Uint8Array): Promise<string>;
}

export interface AuthGateway {
  authenticate(sessionToken: string | null): Promise<Principal | null>;
}

export interface CvRepository {
  list(userId: string): Promise<unknown[]>;
  save(userId: string, input: SavedCvInput): Promise<unknown>;
  delete(userId: string, id: string): Promise<boolean>;
}

export interface CvInputInput {
  id: string;
  name: string;
  content: string;
}

export interface CvInputRecord extends CvInputInput {
  createdAt: string;
  updatedAt: string;
}

export interface CvInputRepository {
  list(userId: string, limit: number): Promise<CvInputRecord[]>;
  save(userId: string, input: CvInputInput): Promise<CvInputRecord | null>;
}

export interface ApplicationRecord extends ApplicationInput {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationRepository {
  list(userId: string, limit: number): Promise<ApplicationRecord[]>;
  save(userId: string, input: ApplicationInput): Promise<ApplicationRecord>;
}

export interface UsageRepository {
  getAiUsage(userId: string, date: string): Promise<number>;
  tryConsumeAiUse(userId: string, date: string, limit: number | null): Promise<boolean>;
  createImportWorkflow(userId: string, workflowId: string, cvHash: string, expiresAt: Date): Promise<void>;
  tryConsumeImportUse(workflowId: string, userId: string, cvHash: string, now: Date): Promise<boolean>;
}

export interface PhotoRecord {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
}

export interface SavedPhoto {
  id: string;
  deletedOldest: boolean;
}

export interface PhotoRepository {
  list(userId: string): Promise<PhotoRecord[]>;
  save(userId: string, name: string, dataUrl: string, maxPhotos: number): Promise<SavedPhoto>;
  delete(userId: string, id: string): Promise<boolean>;
}

export interface PdfArchiveRecord {
  id: string;
  filename: string;
  objectKey: string;
  sizeBytes: number;
  contentHash: string | null;
  createdAt: string;
}

export interface PdfExportLimits {
  daily: number | null;
  maxArchivedPdfs: number;
  maxArchivedPdfBytes: number;
}

export type PdfExportCommitResult =
  | { status: "created" }
  | { status: "duplicate"; archive: PdfArchiveRecord }
  | { status: "daily_limit_reached" }
  | { status: "archive_count_limit_reached" }
  | { status: "archive_size_limit_reached" };

export interface PdfArchiveRepository {
  tryCommitExport(userId: string, date: string, record: PdfArchiveRecord, limits: PdfExportLimits): Promise<PdfExportCommitResult>;
  list(userId: string, limit: number): Promise<PdfArchiveRecord[]>;
  findByHash(userId: string, contentHash: string): Promise<PdfArchiveRecord | null>;
  findByFilename(userId: string, filename: string): Promise<PdfArchiveRecord | null>;
  find(userId: string, id: string): Promise<PdfArchiveRecord | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

export interface PdfQuotaSettingsRepository {
  get(): Promise<PdfQuotaSettings>;
  update(settings: PdfQuotaSettings): Promise<void>;
}

export interface AdminMetrics {
  totals: { applications: number; users: number; companies: number };
  savedCvs: { savedCvs: number };
  usage: { aiUses: number; aiUsers: number };
  topCompanies: Array<{ company: string; applications: number }>;
  recentApplications: Array<{ company: string; role: string; status: string; language: CvLanguage; style: CvStyle; createdAt: string }>;
}

export interface AdminMetricsRepository {
  getMetrics(): Promise<AdminMetrics>;
}

export interface CvAiService {
  import(description: string, language: CvLanguage): Promise<CvData>;
  rewrite(cv: CvData, targetRole: string, jobDescription: string | undefined, language: CvLanguage): Promise<CvData>;
  modify(cv: CvData, instruction: string, jobDescription: string | undefined, language: CvLanguage): Promise<CvData>;
  translate(cv: CvData, language: CvLanguage): Promise<CvData>;
}

export type ChatMessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}

export interface ChatModelRequest {
  messages: readonly ChatMessage[];
  temperature?: number;
  responseFormat?: "json";
}

export interface ChatModel {
  complete(request: ChatModelRequest): Promise<string>;
}

export interface CvRenderer {
  render(cv: CvData, options: RenderOptions): string;
}

export interface PdfGenerator {
  generate(html: string): Promise<Uint8Array>;
}

export interface ObjectStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ApplicationServices {
  auth: AuthGateway;
  cvs: CvRepository;
  cvInputs: CvInputRepository;
  applications: ApplicationRepository;
  usage: UsageRepository;
  photos: PhotoRepository;
  pdfArchives: PdfArchiveRepository;
  pdfQuotas: PdfQuotaSettingsRepository;
  adminMetrics: AdminMetricsRepository;
  ai: CvAiService;
  renderer: CvRenderer;
  pdf: PdfGenerator;
  objects: ObjectStore;
  clock: Clock;
  ids: IdGenerator;
  hasher: ContentHasher;
}
