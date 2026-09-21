import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";

import type {
  AdminMetrics,
  AdminMetricsRepository,
  AiUsageProvider,
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
  PdfExportCommitResult,
  PdfExportLimits,
  PdfQuotaSettingsRepository,
  PhotoRecord,
  PhotoRepository,
  SavedPhoto,
  UsageRepository,
} from "@nomcci/cvmaker-application";
import { DEFAULT_PDF_QUOTA_SETTINGS, type ApplicationInput, type CvData, type CvLanguage, type PdfQuotaSettings, type Principal, type SavedCvInput } from "@nomcci/cvmaker-domain";

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
  async import(description: string, language: CvLanguage): Promise<CvData> {
    return {
      personal_info: { full_name: language === "es" ? "Persona de Ejemplo" : "Example Person" },
      summary: description.trim(),
      experience: [],
      education: [],
      skills: [],
      languages: [],
    };
  }

  async rewrite(cv: CvData, targetRole: string, jobDescription: string | undefined, language: CvLanguage): Promise<CvData> {
    return this.withSummary(cv, `rewrite:${language}:${targetRole}:${jobDescription ?? ""}`);
  }

  async modify(cv: CvData, instruction: string, jobDescription: string | undefined, language: CvLanguage): Promise<CvData> {
    return this.withSummary(cv, `modify:${language}:${instruction}:${jobDescription ?? ""}`);
  }

  async translate(cv: CvData, language: CvLanguage): Promise<CvData> {
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
  private readonly records = new Map<string, { ownerId: string; record: CvInputRecord }>();

  constructor(private readonly clock: Clock) {}

  async list(userId: string, limit: number): Promise<CvInputRecord[]> {
    return [...this.records.values()]
      .filter((stored) => stored.ownerId === userId)
      .map((stored) => stored.record)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((record) => structuredClone(record));
  }

  async save(userId: string, input: CvInputInput): Promise<CvInputRecord | null> {
    const previous = this.records.get(input.id);
    if (previous && previous.ownerId !== userId) return null;
    const now = this.clock.now().toISOString();
    const record: CvInputRecord = {
      ...structuredClone(input),
      createdAt: previous?.record.createdAt ?? now,
      updatedAt: now,
    };
    this.records.set(input.id, { ownerId: userId, record });
    return structuredClone(record);
  }
}

export class InMemoryApplicationRepository implements ApplicationRepository {
  private readonly records = new Map<string, { ownerId: string; record: ApplicationRecord }>();

  constructor(private readonly ids: IdGenerator, private readonly clock: Clock) {}

  async list(userId: string, limit: number): Promise<ApplicationRecord[]> {
    return [...this.records.values()]
      .filter((stored) => stored.ownerId === userId)
      .map((stored) => stored.record)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((record) => structuredClone(record));
  }

  async save(userId: string, input: ApplicationInput): Promise<ApplicationRecord> {
    const id = this.ids.generate();
    if (this.records.has(id)) throw new Error("Application id collision");
    const now = this.clock.now().toISOString();
    const record: ApplicationRecord = {
      ...structuredClone(input),
      id,
      status: input.status || "draft",
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(id, { ownerId: userId, record });
    return structuredClone(record);
  }
}

export class InMemoryUsageRepository implements UsageRepository {
  private readonly aiUses = new Map<string, number>();
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
  private readonly records = new Map<string, { ownerId: string; record: PhotoRecord }>();

  constructor(private readonly ids: IdGenerator, private readonly clock: Clock) {}

  async list(userId: string): Promise<PhotoRecord[]> {
    return [...this.byUser(userId)].reverse().map((record) => structuredClone(record));
  }

  async save(userId: string, name: string, dataUrl: string, maxPhotos: number): Promise<SavedPhoto> {
    const existing = this.byUser(userId);
    let deletedOldest = false;
    if (maxPhotos > 0 && existing.length >= maxPhotos) {
      this.records.delete(existing[0]!.id);
      deletedOldest = true;
    }

    const id = this.ids.generate();
    if (this.records.has(id)) throw new Error("Photo id collision");
    const photo: PhotoRecord = {
      id,
      name,
      dataUrl,
      createdAt: this.clock.now().toISOString(),
    };
    this.records.set(photo.id, { ownerId: userId, record: photo });
    return { id: photo.id, deletedOldest };
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const stored = this.records.get(id);
    if (!stored || stored.ownerId !== userId) return false;
    return this.records.delete(id);
  }

  private byUser(userId: string): PhotoRecord[] {
    return [...this.records.values()]
      .filter((stored) => stored.ownerId === userId)
      .map((stored) => stored.record)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export class InMemoryPdfArchiveRepository implements PdfArchiveRepository {
  private readonly records = new Map<string, { ownerId: string; record: PdfArchiveRecord }>();
  private readonly dailyUses = new Map<string, number>();

  async tryCommitExport(
    userId: string,
    date: string,
    record: PdfArchiveRecord,
    limits: PdfExportLimits,
  ): Promise<PdfExportCommitResult> {
    const archives = this.byUser(userId);
    const duplicate = record.contentHash
      ? archives.find((candidate) => candidate.contentHash === record.contentHash)
      : undefined;
    if (duplicate) return { status: "duplicate", archive: structuredClone(duplicate) };

    const usageKey = `${userId}:${date}`;
    const dailyUses = this.dailyUses.get(usageKey) ?? 0;
    if (limits.daily !== null && dailyUses >= limits.daily) return { status: "daily_limit_reached" };
    if (archives.length >= limits.maxArchivedPdfs) return { status: "archive_count_limit_reached" };
    if (archives.reduce((total, archive) => total + archive.sizeBytes, 0) + record.sizeBytes > limits.maxArchivedPdfBytes) {
      return { status: "archive_size_limit_reached" };
    }
    if (this.records.has(record.id)) throw new Error("PDF archive id collision");
    if ([...this.records.values()].some((stored) => stored.record.objectKey === record.objectKey)) {
      throw new Error("PDF archive object key collision");
    }

    this.records.set(record.id, { ownerId: userId, record: structuredClone(record) });
    this.dailyUses.set(usageKey, dailyUses + 1);
    return { status: "created" };
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
    const stored = this.records.get(id);
    return stored?.ownerId === userId ? structuredClone(stored.record) : null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const stored = this.records.get(id);
    if (!stored || stored.ownerId !== userId) return false;
    return this.records.delete(id);
  }

  private byUser(userId: string): PdfArchiveRecord[] {
    return [...this.records.values()]
      .filter((stored) => stored.ownerId === userId)
      .map((stored) => stored.record)
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
  savedCvs: { savedCvs: 0 },
  usage: { aiUses: 0, aiUsers: 0 },
  topCompanies: [],
  recentApplications: [],
};

export class FixtureAdminMetricsRepository implements AdminMetricsRepository {
  constructor(private readonly metrics: AdminMetrics = EMPTY_ADMIN_METRICS) {}

  async getMetrics(): Promise<AdminMetrics> {
    return structuredClone(this.metrics);
  }
}

/**
 * Default portable AI usage provider. Provider-specific forks replace this with
 * an adapter that reads real spend data from their AI gateway.
 */
export class UnavailableAiUsageProvider implements AiUsageProvider {
  async getUsage(): Promise<null> {
    return null;
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
