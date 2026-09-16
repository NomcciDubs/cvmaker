import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";
import type {
  AdminMetrics,
  AdminMetricsRepository,
  ApplicationRecord,
  ApplicationRepository,
  CvInputInput,
  CvInputRecord,
  CvInputRepository,
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
import {
  DEFAULT_PDF_QUOTA_SETTINGS,
  type ApplicationInput,
  type CvStyle,
  type Language,
  type PdfQuotaSettings,
} from "@nomcci/cvmaker-domain";

import { SqliteCvRepository, sqliteFilename } from "./sqlite";
import type { ClosableDatabaseRepositories, RepositoryDependencies } from "./types";

interface CvInputRow {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface ApplicationRow {
  id: string;
  company: string;
  role: string;
  status: string;
  jobUrl: string | null;
  jobDescription: string | null;
  cvJson: string;
  html: string;
  language: Language;
  style: CvStyle;
  template: ApplicationInput["template"];
  createdAt: string;
  updatedAt: string;
}

interface PhotoRow {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
}

interface PdfArchiveRow {
  id: string;
  filename: string;
  objectKey: string;
  sizeBytes: number;
  contentHash: string | null;
  createdAt: string;
}

export class SqliteRepositoryBundle implements ClosableDatabaseRepositories {
  private readonly database: Database.Database;
  readonly cvs: SqliteCvRepository;
  readonly cvInputs: CvInputRepository;
  readonly applications: ApplicationRepository;
  readonly usage: UsageRepository;
  readonly photos: PhotoRepository;
  readonly pdfArchives: PdfArchiveRepository;
  readonly pdfQuotas: PdfQuotaSettingsRepository;
  readonly adminMetrics: AdminMetricsRepository;
  private closed = false;

  constructor(databaseUrl: string, dependencies: RepositoryDependencies = {}) {
    this.database = new Database(sqliteFilename(databaseUrl));
    this.database.pragma("foreign_keys = ON");
    const generateId = dependencies.generateId ?? randomUUID;
    const now = dependencies.now ?? (() => new Date());
    this.cvs = new SqliteCvRepository(databaseUrl, dependencies);
    this.cvInputs = new SqliteCvInputRepository(this.database, now);
    this.applications = new SqliteApplicationRepository(this.database, generateId, now);
    this.usage = new SqliteUsageRepository(this.database, now);
    this.photos = new SqlitePhotoRepository(this.database, generateId, now);
    this.pdfArchives = new SqlitePdfArchiveRepository(this.database, now);
    this.pdfQuotas = new SqlitePdfQuotaSettingsRepository(this.database, now);
    this.adminMetrics = new SqliteAdminMetricsRepository(this.database);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.cvs.close();
    this.database.close();
    this.closed = true;
  }
}

class SqliteCvInputRepository implements CvInputRepository {
  constructor(private readonly database: Database.Database, private readonly now: () => Date) {}

  async list(userId: string, limit: number): Promise<CvInputRecord[]> {
    return this.database.prepare(
      `SELECT id, name, content, created_at AS createdAt, updated_at AS updatedAt
       FROM cv_inputs WHERE user_id = ? ORDER BY updated_at DESC, id ASC LIMIT ?`,
    ).all(userId, normalizedLimit(limit)) as CvInputRecord[];
  }

  async save(userId: string, input: CvInputInput): Promise<CvInputRecord | null> {
    return this.database.transaction(() => {
      const owner = this.database.prepare("SELECT user_id AS userId FROM cv_inputs WHERE id = ?").get(input.id) as
        | { userId: string }
        | undefined;
      if (owner && owner.userId !== userId) return null;
      const now = this.now().toISOString();
      if (owner) {
        this.database.prepare(
          "UPDATE cv_inputs SET name = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        ).run(input.name, input.content, now, input.id, userId);
      } else {
        this.database.prepare(
          "INSERT INTO cv_inputs (id, user_id, name, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(input.id, userId, input.name, input.content, now, now);
      }
      return this.database.prepare(
        `SELECT id, name, content, created_at AS createdAt, updated_at AS updatedAt
         FROM cv_inputs WHERE id = ? AND user_id = ?`,
      ).get(input.id, userId) as CvInputRow;
    }).immediate();
  }
}

class SqliteApplicationRepository implements ApplicationRepository {
  constructor(
    private readonly database: Database.Database,
    private readonly generateId: () => string,
    private readonly now: () => Date,
  ) {}

  async list(userId: string, limit: number): Promise<ApplicationRecord[]> {
    const rows = this.database.prepare(
      `SELECT id, company, role, status, job_url AS jobUrl, job_description AS jobDescription,
        cv_json AS cvJson, cv_html AS html, language, style, template,
        created_at AS createdAt, updated_at AS updatedAt
       FROM applications WHERE user_id = ? ORDER BY created_at DESC, id ASC LIMIT ?`,
    ).all(userId, normalizedLimit(limit)) as ApplicationRow[];
    return rows.map(mapApplication);
  }

  async save(userId: string, input: ApplicationInput): Promise<ApplicationRecord> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = this.generateId();
      const now = this.now().toISOString();
      try {
        this.database.prepare(
          `INSERT INTO applications (
            id, user_id, company, role, status, job_url, job_description, cv_json, cv_html,
            language, style, template, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          userId,
          input.company,
          input.role,
          input.status || "draft",
          input.jobUrl || null,
          input.jobDescription || null,
          JSON.stringify(input.cv),
          input.html,
          input.language,
          input.style,
          input.template,
          now,
          now,
        );
        return mapApplication(this.select(id, userId));
      } catch (error) {
        if (!isSqliteConstraint(error)) throw error;
      }
    }
    throw new Error("Unable to generate a unique application id");
  }

  private select(id: string, userId: string): ApplicationRow {
    return this.database.prepare(
      `SELECT id, company, role, status, job_url AS jobUrl, job_description AS jobDescription,
        cv_json AS cvJson, cv_html AS html, language, style, template,
        created_at AS createdAt, updated_at AS updatedAt
       FROM applications WHERE id = ? AND user_id = ?`,
    ).get(id, userId) as ApplicationRow;
  }
}

class SqliteUsageRepository implements UsageRepository {
  constructor(private readonly database: Database.Database, private readonly now: () => Date) {}

  async getAiUsage(userId: string, date: string): Promise<number> {
    const row = this.database.prepare("SELECT count FROM daily_usage WHERE user_id = ? AND usage_date = ?").get(userId, date) as
      | { count: number }
      | undefined;
    return Number(row?.count ?? 0);
  }

  async tryConsumeAiUse(userId: string, date: string, limit: number | null): Promise<boolean> {
    return this.database.transaction(() => {
      const current = this.database.prepare("SELECT count FROM daily_usage WHERE user_id = ? AND usage_date = ?").get(userId, date) as
        | { count: number }
        | undefined;
      if (limit !== null && Number(current?.count ?? 0) >= limit) return false;
      this.database.prepare(
        `INSERT INTO daily_usage (user_id, usage_date, count, updated_at) VALUES (?, ?, 1, ?)
         ON CONFLICT(user_id, usage_date) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
      ).run(userId, date, this.now().toISOString());
      return true;
    }).immediate();
  }

  async createImportWorkflow(userId: string, workflowId: string, cvHash: string, expiresAt: Date): Promise<void> {
    const now = this.now().toISOString();
    this.database.prepare(
      `INSERT INTO import_workflows (id, user_id, cv_hash, remaining_ai_uses, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
    ).run(workflowId, userId, cvHash, expiresAt.toISOString(), now, now);
  }

  async tryConsumeImportUse(workflowId: string, userId: string, cvHash: string, now: Date): Promise<boolean> {
    return this.database.prepare(
      `UPDATE import_workflows SET remaining_ai_uses = remaining_ai_uses - 1, updated_at = ?
       WHERE id = ? AND user_id = ? AND cv_hash = ? AND expires_at > ? AND remaining_ai_uses > 0`,
    ).run(now.toISOString(), workflowId, userId, cvHash, now.toISOString()).changes === 1;
  }
}

class SqlitePhotoRepository implements PhotoRepository {
  constructor(
    private readonly database: Database.Database,
    private readonly generateId: () => string,
    private readonly now: () => Date,
  ) {}

  async list(userId: string): Promise<PhotoRecord[]> {
    return this.database.prepare(
      `SELECT id, name, data_url AS dataUrl, created_at AS createdAt
       FROM user_photos WHERE user_id = ? ORDER BY created_at DESC, id ASC`,
    ).all(userId) as PhotoRecord[];
  }

  async save(userId: string, name: string, dataUrl: string, maxPhotos: number): Promise<SavedPhoto> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = this.generateId();
      try {
        return this.database.transaction(() => {
          const count = this.database.prepare("SELECT COUNT(*) AS total FROM user_photos WHERE user_id = ?").get(userId) as { total: number };
          let deletedOldest = false;
          if (maxPhotos > 0 && Number(count.total) >= maxPhotos) {
            this.database.prepare(
              `DELETE FROM user_photos WHERE id = (
                SELECT id FROM user_photos WHERE user_id = ? ORDER BY created_at ASC, id ASC LIMIT 1
              )`,
            ).run(userId);
            deletedOldest = true;
          }
          this.database.prepare(
            "INSERT INTO user_photos (id, user_id, name, data_url, created_at) VALUES (?, ?, ?, ?, ?)",
          ).run(id, userId, name, dataUrl, this.now().toISOString());
          return { id, deletedOldest };
        }).immediate();
      } catch (error) {
        if (!isSqliteConstraint(error)) throw error;
      }
    }
    throw new Error("Unable to generate a unique photo id");
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.database.prepare("DELETE FROM user_photos WHERE id = ? AND user_id = ?").run(id, userId).changes === 1;
  }
}

class SqlitePdfArchiveRepository implements PdfArchiveRepository {
  constructor(private readonly database: Database.Database, private readonly now: () => Date) {}

  async tryCommitExport(
    userId: string,
    date: string,
    record: PdfArchiveRecord,
    limits: PdfExportLimits,
  ): Promise<PdfExportCommitResult> {
    return this.database.transaction(() => {
      if (record.contentHash) {
        const duplicate = this.database.prepare(
          `SELECT id, filename, object_key AS objectKey, size_bytes AS sizeBytes,
            content_hash AS contentHash, created_at AS createdAt
           FROM pdf_archives WHERE user_id = ? AND content_hash = ?`,
        ).get(userId, record.contentHash) as PdfArchiveRow | undefined;
        if (duplicate) return { status: "duplicate", archive: mapPdfArchive(duplicate) } as const;
      }

      const usage = this.database.prepare("SELECT count FROM pdf_export_usage WHERE user_id = ? AND usage_date = ?").get(userId, date) as
        | { count: number }
        | undefined;
      if (limits.daily !== null && Number(usage?.count ?? 0) >= limits.daily) return { status: "daily_limit_reached" } as const;

      const aggregate = this.database.prepare(
        "SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS sizeBytes FROM pdf_archives WHERE user_id = ?",
      ).get(userId) as { count: number; sizeBytes: number };
      if (Number(aggregate.count) >= limits.maxArchivedPdfs) return { status: "archive_count_limit_reached" } as const;
      if (Number(aggregate.sizeBytes) + record.sizeBytes > limits.maxArchivedPdfBytes) {
        return { status: "archive_size_limit_reached" } as const;
      }

      this.database.prepare(
        `INSERT INTO pdf_archives (id, user_id, filename, object_key, size_bytes, content_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(record.id, userId, record.filename, record.objectKey, record.sizeBytes, record.contentHash, record.createdAt);
      this.database.prepare(
        `INSERT INTO pdf_export_usage (user_id, usage_date, count, updated_at) VALUES (?, ?, 1, ?)
         ON CONFLICT(user_id, usage_date) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
      ).run(userId, date, this.now().toISOString());
      return { status: "created" } as const;
    }).immediate();
  }

  async list(userId: string, limit: number): Promise<PdfArchiveRecord[]> {
    const rows = this.database.prepare(
      `SELECT id, filename, object_key AS objectKey, size_bytes AS sizeBytes,
        content_hash AS contentHash, created_at AS createdAt
       FROM pdf_archives WHERE user_id = ? ORDER BY created_at DESC, id ASC LIMIT ?`,
    ).all(userId, normalizedLimit(limit)) as PdfArchiveRow[];
    return rows.map(mapPdfArchive);
  }

  async findByHash(userId: string, contentHash: string): Promise<PdfArchiveRecord | null> {
    const row = this.database.prepare(
      `SELECT id, filename, object_key AS objectKey, size_bytes AS sizeBytes,
        content_hash AS contentHash, created_at AS createdAt
       FROM pdf_archives WHERE user_id = ? AND content_hash = ?`,
    ).get(userId, contentHash) as PdfArchiveRow | undefined;
    return row ? mapPdfArchive(row) : null;
  }

  async findByFilename(userId: string, filename: string): Promise<PdfArchiveRecord | null> {
    const row = this.database.prepare(
      `SELECT id, filename, object_key AS objectKey, size_bytes AS sizeBytes,
        content_hash AS contentHash, created_at AS createdAt
       FROM pdf_archives WHERE user_id = ? AND filename = ?`,
    ).get(userId, filename) as PdfArchiveRow | undefined;
    return row ? mapPdfArchive(row) : null;
  }

  async find(userId: string, id: string): Promise<PdfArchiveRecord | null> {
    const row = this.database.prepare(
      `SELECT id, filename, object_key AS objectKey, size_bytes AS sizeBytes,
        content_hash AS contentHash, created_at AS createdAt
       FROM pdf_archives WHERE user_id = ? AND id = ?`,
    ).get(userId, id) as PdfArchiveRow | undefined;
    return row ? mapPdfArchive(row) : null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.database.prepare("DELETE FROM pdf_archives WHERE id = ? AND user_id = ?").run(id, userId).changes === 1;
  }
}

class SqlitePdfQuotaSettingsRepository implements PdfQuotaSettingsRepository {
  constructor(private readonly database: Database.Database, private readonly now: () => Date) {}

  async get(): Promise<PdfQuotaSettings> {
    const row = this.database.prepare(
      `SELECT default_daily AS defaultDaily, friend_daily AS friendDaily,
        super_admin_daily AS superAdminDaily, max_archived_pdfs AS maxArchivedPdfs,
        max_archived_pdf_bytes AS maxArchivedPdfBytes
       FROM pdf_quota_settings WHERE id = 1`,
    ).get() as PdfQuotaSettings | undefined;
    return row ? normalizeQuotaSettings(row) : structuredClone(DEFAULT_PDF_QUOTA_SETTINGS);
  }

  async update(settings: PdfQuotaSettings): Promise<void> {
    this.database.prepare(
      `INSERT INTO pdf_quota_settings (
        id, default_daily, friend_daily, super_admin_daily, max_archived_pdfs, max_archived_pdf_bytes, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        default_daily = excluded.default_daily,
        friend_daily = excluded.friend_daily,
        super_admin_daily = excluded.super_admin_daily,
        max_archived_pdfs = excluded.max_archived_pdfs,
        max_archived_pdf_bytes = excluded.max_archived_pdf_bytes,
        updated_at = excluded.updated_at`,
    ).run(
      settings.defaultDaily,
      settings.friendDaily,
      settings.superAdminDaily,
      settings.maxArchivedPdfs,
      settings.maxArchivedPdfBytes,
      this.now().toISOString(),
    );
  }
}

class SqliteAdminMetricsRepository implements AdminMetricsRepository {
  constructor(private readonly database: Database.Database) {}

  async getMetrics(): Promise<AdminMetrics> {
    const totals = this.database.prepare(
      `SELECT COUNT(*) AS applications, COUNT(DISTINCT user_id) AS users,
        COUNT(DISTINCT company) AS companies FROM applications`,
    ).get() as AdminMetrics["totals"];
    const savedCvs = this.database.prepare("SELECT COUNT(*) AS savedCvs FROM saved_cvs").get() as AdminMetrics["savedCvs"];
    const usage = this.database.prepare(
      "SELECT COALESCE(SUM(count), 0) AS aiUses, COUNT(DISTINCT user_id) AS aiUsers FROM daily_usage",
    ).get() as AdminMetrics["usage"];
    const topCompanies = this.database.prepare(
      `SELECT company, COUNT(*) AS applications FROM applications
       GROUP BY company ORDER BY applications DESC, company ASC LIMIT 8`,
    ).all() as AdminMetrics["topCompanies"];
    const recentApplications = this.database.prepare(
      `SELECT company, role, status, language, style, created_at AS createdAt
       FROM applications ORDER BY created_at DESC, id ASC LIMIT 8`,
    ).all() as AdminMetrics["recentApplications"];
    return { totals, savedCvs, usage, topCompanies, recentApplications };
  }
}

function mapApplication(row: ApplicationRow): ApplicationRecord {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    status: row.status,
    ...(row.jobUrl ? { jobUrl: row.jobUrl } : {}),
    ...(row.jobDescription ? { jobDescription: row.jobDescription } : {}),
    cv: JSON.parse(row.cvJson),
    html: row.html,
    language: row.language,
    style: row.style,
    template: row.template,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPdfArchive(row: PdfArchiveRow): PdfArchiveRecord {
  return {
    id: row.id,
    filename: row.filename,
    objectKey: row.objectKey,
    sizeBytes: Number(row.sizeBytes),
    contentHash: row.contentHash,
    createdAt: row.createdAt,
  };
}

function normalizeQuotaSettings(settings: PdfQuotaSettings): PdfQuotaSettings {
  return {
    defaultDaily: Number(settings.defaultDaily),
    friendDaily: Number(settings.friendDaily),
    superAdminDaily: settings.superAdminDaily === null ? null : Number(settings.superAdminDaily),
    maxArchivedPdfs: Number(settings.maxArchivedPdfs),
    maxArchivedPdfBytes: Number(settings.maxArchivedPdfBytes),
  };
}

function normalizedLimit(limit: number): number {
  return Math.max(0, Math.trunc(limit));
}

function isSqliteConstraint(error: unknown): boolean {
  return error instanceof Error && "code" in error && typeof error.code === "string" && error.code.startsWith("SQLITE_CONSTRAINT");
}
