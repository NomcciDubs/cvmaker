import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";

import type {
  AdminMetrics,
  AdminMetricsRepository,
  ApplicationRecord,
  ApplicationRepository,
  AuthGateway,
  Clock,
  ContentHasher,
  CvAiService,
  CvInputInput,
  CvInputRecord,
  CvInputRepository,
  CvRepository,
  IdGenerator,
  ObjectStore,
  PdfArchiveRecord,
  PdfArchiveRepository,
  PdfQuotaSettingsRepository,
  PhotoRecord,
  PhotoRepository,
  SavedPhoto,
  UsageRepository,
} from "@nomcci/cvmaker-application";
import { DEFAULT_PDF_QUOTA_SETTINGS, type ApplicationInput, type CvData, type Language, type PdfQuotaSettings, type Principal, type SavedCvInput } from "@nomcci/cvmaker-domain";

export class NodeClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class NodeIdGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}

export class NodeSha256Hasher implements ContentHasher {
  async hash(value: string | Uint8Array): Promise<string> {
    return createHash("sha256").update(value).digest("hex");
  }
}

export class FixtureAuthGateway implements AuthGateway {
  constructor(
    private readonly sessionToken = "local-dev",
    private readonly principal: Principal = {
      id: "00000000-0000-4000-8000-000000000001",
      email: "developer@example.test",
      name: "Local Developer",
      nickname: "developer",
      country: null,
      role: "USER",
      permissions: [],
    },
  ) {}

  async authenticate(sessionToken: string | null): Promise<Principal | null> {
    return sessionToken === this.sessionToken ? structuredClone(this.principal) : null;
  }
}

export class DeterministicFakeCvAi implements CvAiService {
  async import(description: string, language: Language): Promise<CvData> {
    return {
      personal_info: { full_name: language === "es" ? "Persona de Ejemplo" : "Example Person" },
      summary: description.trim(),
      experience: [],
      education: [],
      skills: [],
      languages: [],
    };
  }

  async rewrite(cv: CvData, targetRole: string, jobDescription: string | undefined, language: Language): Promise<CvData> {
    return this.withSummary(cv, `rewrite:${language}:${targetRole}:${jobDescription ?? ""}`);
  }

  async modify(cv: CvData, instruction: string, jobDescription: string | undefined, language: Language): Promise<CvData> {
    return this.withSummary(cv, `modify:${language}:${instruction}:${jobDescription ?? ""}`);
  }

  async translate(cv: CvData, language: Language): Promise<CvData> {
    return this.withSummary(cv, `translate:${language}`);
  }

  private withSummary(cv: CvData, operation: string): CvData {
    const copy = structuredClone(cv);
    copy.summary = `${operation}${copy.summary ? `\n${copy.summary}` : ""}`;
    return copy;
  }
}

export interface StoredCv extends SavedCvInput {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export class InMemoryCvRepository implements CvRepository {
  private readonly records = new Map<string, StoredCv>();

  constructor(private readonly ids: IdGenerator, private readonly clock: Clock) {}

  async list(userId: string): Promise<StoredCv[]> {
    return [...this.records.values()]
      .filter((record) => record.ownerId === userId)
      .map((record) => structuredClone(record));
  }

  async save(userId: string, input: SavedCvInput): Promise<StoredCv> {
    const key = this.key(userId, input.id ?? this.ids.generate());
    const previous = this.records.get(key);
    const now = this.clock.now().toISOString();
    const record: StoredCv = {
      ...structuredClone(input),
      id: input.id ?? key.slice(userId.length + 1),
      ownerId: userId,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    this.records.set(key, record);
    return structuredClone(record);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.records.delete(this.key(userId, id));
  }

  private key(userId: string, id: string): string {
    return `${userId}:${id}`;
  }
}

export class InMemoryCvInputRepository implements CvInputRepository {
  private readonly records = new Map<string, CvInputRecord>();

  constructor(private readonly clock: Clock) {}

  async list(userId: string): Promise<CvInputRecord[]> {
    return this.byUser(userId).map((record) => structuredClone(record));
  }

  async save(userId: string, input: CvInputInput): Promise<CvInputRecord> {
    const key = `${userId}:${input.id}`;
    const previous = this.records.get(key);
    const now = this.clock.now().toISOString();
    const record: CvInputRecord = {
      ...structuredClone(input),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    this.records.set(key, record);
    return structuredClone(record);
  }

  private byUser(userId: string): CvInputRecord[] {
    return [...this.records]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, record]) => record)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

export class InMemoryApplicationRepository implements ApplicationRepository {
  private readonly records = new Map<string, ApplicationRecord>();

  constructor(private readonly ids: IdGenerator, private readonly clock: Clock) {}

  async list(userId: string): Promise<ApplicationRecord[]> {
    return this.byUser(userId).map((record) => structuredClone(record));
  }

  async save(userId: string, input: ApplicationInput): Promise<ApplicationRecord> {
    const id = this.ids.generate();
    const now = this.clock.now().toISOString();
    const record: ApplicationRecord = { ...structuredClone(input), id, createdAt: now, updatedAt: now };
    this.records.set(`${userId}:${id}`, record);
    return structuredClone(record);
  }

  private byUser(userId: string): ApplicationRecord[] {
    return [...this.records]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, record]) => record)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryUsageRepository implements UsageRepository {
  private readonly aiUses = new Map<string, number>();
  private readonly pdfUses = new Map<string, number>();
  private readonly importWorkflows = new Map<string, {
    userId: string;
    cvHash: string;
    remainingAiUses: number;
    expiresAt: string;
  }>();

  async getAiUsage(userId: string, date: string): Promise<number> {
    return this.aiUses.get(`${userId}:${date}`) ?? 0;
  }

  async tryConsumeAiUse(userId: string, date: string, limit: number | null): Promise<boolean> {
    return this.tryConsume(this.aiUses, userId, date, limit);
  }

  async getPdfUsage(userId: string, date: string): Promise<number> {
    return this.pdfUses.get(`${userId}:${date}`) ?? 0;
  }

  async tryConsumePdfUse(userId: string, date: string, limit: number | null): Promise<boolean> {
    return this.tryConsume(this.pdfUses, userId, date, limit);
  }

  async createImportWorkflow(userId: string, workflowId: string, cvHash: string, expiresAt: Date): Promise<void> {
    this.importWorkflows.set(workflowId, {
      userId,
      cvHash,
      remainingAiUses: 1,
      expiresAt: expiresAt.toISOString(),
    });
  }

  async tryConsumeImportUse(workflowId: string, userId: string, cvHash: string, now: Date): Promise<boolean> {
    const workflow = this.importWorkflows.get(workflowId);
    if (!workflow || workflow.userId !== userId || workflow.cvHash !== cvHash) return false;
    if (workflow.remainingAiUses <= 0) return false;
    if (new Date(workflow.expiresAt).getTime() <= now.getTime()) return false;
    workflow.remainingAiUses -= 1;
    return true;
  }

  private tryConsume(uses: Map<string, number>, userId: string, date: string, limit: number | null): boolean {
    const key = `${userId}:${date}`;
    const current = uses.get(key) ?? 0;
    if (limit !== null && current >= limit) return false;
    uses.set(key, current + 1);
    return true;
  }
}

export class InMemoryPhotoRepository implements PhotoRepository {
  private readonly records = new Map<string, PhotoRecord>();

  constructor(private readonly ids: IdGenerator, private readonly clock: Clock) {}

  async list(userId: string): Promise<PhotoRecord[]> {
    return [...this.byUser(userId)].reverse().map((record) => structuredClone(record));
  }

  async save(userId: string, name: string, dataUrl: string, maxPhotos: number): Promise<SavedPhoto> {
    const existing = this.byUser(userId);
    let deletedOldest = false;
    if (maxPhotos > 0 && existing.length >= maxPhotos) {
      this.records.delete(`${userId}:${existing[0]!.id}`);
      deletedOldest = true;
    }

    const photo: PhotoRecord = {
      id: this.ids.generate(),
      name,
      dataUrl,
      createdAt: this.clock.now().toISOString(),
    };
    this.records.set(`${userId}:${photo.id}`, photo);
    return { photo: structuredClone(photo), deletedOldest };
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.records.delete(`${userId}:${id}`);
  }

  private byUser(userId: string): PhotoRecord[] {
    return [...this.records]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, record]) => record)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export class InMemoryPdfArchiveRepository implements PdfArchiveRepository {
  private readonly records = new Map<string, PdfArchiveRecord>();

  async create(userId: string, record: PdfArchiveRecord): Promise<void> {
    this.records.set(`${userId}:${record.id}`, structuredClone(record));
  }

  async list(userId: string, limit: number): Promise<PdfArchiveRecord[]> {
    return this.byUser(userId).slice(0, limit).map((record) => structuredClone(record));
  }

  async findByHash(userId: string, contentHash: string): Promise<PdfArchiveRecord | null> {
    const record = this.byUser(userId).find((candidate) => candidate.contentHash === contentHash);
    return record ? structuredClone(record) : null;
  }

  async findByFilename(userId: string, filename: string): Promise<PdfArchiveRecord | null> {
    const record = this.byUser(userId).find((candidate) => candidate.filename === filename);
    return record ? structuredClone(record) : null;
  }

  async find(userId: string, id: string): Promise<PdfArchiveRecord | null> {
    const record = this.records.get(`${userId}:${id}`);
    return record ? structuredClone(record) : null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.records.delete(`${userId}:${id}`);
  }

  private byUser(userId: string): PdfArchiveRecord[] {
    return [...this.records]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, record]) => record)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryPdfQuotaSettingsRepository implements PdfQuotaSettingsRepository {
  private settings: PdfQuotaSettings;

  constructor(initial: PdfQuotaSettings = DEFAULT_PDF_QUOTA_SETTINGS) {
    this.settings = structuredClone(initial);
  }

  async get(): Promise<PdfQuotaSettings> {
    return structuredClone(this.settings);
  }

  async update(settings: PdfQuotaSettings): Promise<void> {
    this.settings = structuredClone(settings);
  }
}

const EMPTY_ADMIN_METRICS: AdminMetrics = {
  totals: { applications: 0, users: 0, companies: 0 },
  savedCvs: 0,
  aiUses: 0,
  topCompanies: [],
  recentApplications: [],
};

export class InMemoryAdminMetricsRepository implements AdminMetricsRepository {
  constructor(private readonly metrics: AdminMetrics = EMPTY_ADMIN_METRICS) {}

  async getMetrics(): Promise<AdminMetrics> {
    return structuredClone(this.metrics);
  }
}

export class FileSystemObjectStore implements ObjectStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.pathFor(key)));
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    }
  }

  async put(key: string, value: Uint8Array): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, value);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  private pathFor(key: string): string {
    if (!key || isAbsolute(key) || key.includes("\\") || key.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("Invalid object key");
    }
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`)) throw new Error("Invalid object key");
    return path;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
