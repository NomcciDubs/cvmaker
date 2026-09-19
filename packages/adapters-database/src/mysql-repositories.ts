import { randomUUID } from "node:crypto";

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
  type CvLanguage,
  type CvStyle,
  type PdfQuotaSettings,
} from "@nomcci/cvmaker-domain";
import { createPool, type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import { MysqlCvRepository } from "./mysql";
import type { ClosableDatabaseRepositories, RepositoryDependencies } from "./types";

interface CvInputRow extends RowDataPacket, CvInputRecord {}
interface ApplicationRow extends RowDataPacket {
  id: string;
  company: string;
  role: string;
  status: string;
  jobUrl: string | null;
  jobDescription: string | null;
  cvJson: string | object;
  html: string;
  language: CvLanguage;
  style: CvStyle;
  template: ApplicationInput["template"];
  createdAt: string;
  updatedAt: string;
}
interface PhotoRow extends RowDataPacket, PhotoRecord {}
interface PdfArchiveRow extends RowDataPacket {
  id: string;
  filename: string;
  objectKey: string;
  sizeBytes: number | string;
  contentHash: string | null;
  createdAt: string;
}

export class MysqlRepositoryBundle implements ClosableDatabaseRepositories {
  private readonly pool: Pool;
  readonly cvs: MysqlCvRepository;
  readonly cvInputs: CvInputRepository;
  readonly applications: ApplicationRepository;
  readonly usage: UsageRepository;
  readonly photos: PhotoRepository;
  readonly pdfArchives: PdfArchiveRepository;
  readonly pdfQuotas: PdfQuotaSettingsRepository;
  readonly adminMetrics: AdminMetricsRepository;
  private closed = false;

  constructor(databaseUrl: string, dependencies: RepositoryDependencies = {}) {
    this.pool = createPool(databaseUrl);
    const generateId = dependencies.generateId ?? randomUUID;
    const now = dependencies.now ?? (() => new Date());
    this.cvs = new MysqlCvRepository(databaseUrl, dependencies);
    this.cvInputs = new MysqlCvInputRepository(this.pool, now);
    this.applications = new MysqlApplicationRepository(this.pool, generateId, now);
    this.usage = new MysqlUsageRepository(this.pool, now);
    this.photos = new MysqlPhotoRepository(this.pool, generateId, now);
    this.pdfArchives = new MysqlPdfArchiveRepository(this.pool, now);
    this.pdfQuotas = new MysqlPdfQuotaSettingsRepository(this.pool, now);
    this.adminMetrics = new MysqlAdminMetricsRepository(this.pool);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.cvs.close();
    await this.pool.end();
    this.closed = true;
  }
}

class MysqlCvInputRepository implements CvInputRepository {
  constructor(private readonly pool: Pool, private readonly now: () => Date) {}

  async list(userId: string, limit: number): Promise<CvInputRecord[]> {
    const [rows] = await this.pool.query<CvInputRow[]>(
      `SELECT id, name, content, created_at AS createdAt, updated_at AS updatedAt
       FROM cv_inputs WHERE user_id = ? ORDER BY updated_at DESC, id ASC LIMIT ?`,
      [userId, normalizedLimit(limit)],
    );
    return rows;
  }

  async save(userId: string, input: CvInputInput): Promise<CvInputRecord | null> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [owners] = await connection.query<(RowDataPacket & { userId: string })[]>(
        "SELECT user_id AS userId FROM cv_inputs WHERE id = ? FOR UPDATE",
        [input.id],
      );
      const owner = owners[0];
      if (owner && owner.userId !== userId) {
        await connection.rollback();
        return null;
      }
      const now = this.now().toISOString();
      if (owner) {
        await connection.execute(
          "UPDATE cv_inputs SET name = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?",
          [input.name, input.content, now, input.id, userId],
        );
      } else {
        await connection.execute(
          "INSERT INTO cv_inputs (id, user_id, name, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          [input.id, userId, input.name, input.content, now, now],
        );
      }
      const [rows] = await connection.query<CvInputRow[]>(
        `SELECT id, name, content, created_at AS createdAt, updated_at AS updatedAt
         FROM cv_inputs WHERE id = ? AND user_id = ?`,
        [input.id, userId],
      );
      await connection.commit();
      return rows[0] ?? null;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

class MysqlApplicationRepository implements ApplicationRepository {
  constructor(private readonly pool: Pool, private readonly generateId: () => string, private readonly now: () => Date) {}

  async list(userId: string, limit: number): Promise<ApplicationRecord[]> {
    const [rows] = await this.pool.query<ApplicationRow[]>(
      `SELECT id, company, role, status, job_url AS jobUrl, job_description AS jobDescription,
        cv_json AS cvJson, cv_html AS html, language, style, template,
        created_at AS createdAt, updated_at AS updatedAt
       FROM applications WHERE user_id = ? ORDER BY created_at DESC, id ASC LIMIT ?`,
      [userId, normalizedLimit(limit)],
    );
    return rows.map(mapApplication);
  }

  async save(userId: string, input: ApplicationInput): Promise<ApplicationRecord> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = this.generateId();
      const now = this.now().toISOString();
      try {
        await this.pool.execute(
          `INSERT INTO applications (
            id, user_id, company, role, status, job_url, job_description, cv_json, cv_html,
            language, style, template, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, userId, input.company, input.role, input.status || "draft", input.jobUrl || null,
            input.jobDescription || null, JSON.stringify(input.cv), input.html, input.language,
            input.style, input.template, now, now],
        );
        const [rows] = await this.pool.query<ApplicationRow[]>(
          `SELECT id, company, role, status, job_url AS jobUrl, job_description AS jobDescription,
            cv_json AS cvJson, cv_html AS html, language, style, template,
            created_at AS createdAt, updated_at AS updatedAt
           FROM applications WHERE id = ? AND user_id = ?`,
          [id, userId],
        );
        return mapApplication(rows[0]!);
      } catch (error) {
        if (!isDuplicateEntry(error)) throw error;
      }
    }
    throw new Error("Unable to generate a unique application id");
  }
}

class MysqlUsageRepository implements UsageRepository {
  constructor(private readonly pool: Pool, private readonly now: () => Date) {}

  async getAiUsage(userId: string, date: string): Promise<number> {
    const [rows] = await this.pool.query<(RowDataPacket & { count: number })[]>(
      "SELECT count FROM daily_usage WHERE user_id = ? AND usage_date = ?",
      [userId, date],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async tryConsumeAiUse(userId: string, date: string, limit: number | null): Promise<boolean> {
    const timestamp = this.now().toISOString();
    if (limit === null) {
      await this.pool.execute(
        `INSERT INTO daily_usage (user_id, usage_date, count, updated_at) VALUES (?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE count = count + 1, updated_at = VALUES(updated_at)`,
        [userId, date, timestamp],
      );
      return true;
    }

    // affectedRows cannot distinguish a saturated counter through the binary
    // protocol, so the check runs under a row lock like the SQLite transaction.
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<(RowDataPacket & { count: number })[]>(
        "SELECT count FROM daily_usage WHERE user_id = ? AND usage_date = ? FOR UPDATE",
        [userId, date],
      );
      if (Number(rows[0]?.count ?? 0) >= limit) {
        await connection.rollback();
        return false;
      }
      await connection.execute(
        `INSERT INTO daily_usage (user_id, usage_date, count, updated_at) VALUES (?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE count = count + 1, updated_at = VALUES(updated_at)`,
        [userId, date, timestamp],
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async createImportWorkflow(userId: string, workflowId: string, cvHash: string, expiresAt: Date): Promise<void> {
    const now = this.now().toISOString();
    await this.pool.execute(
      `INSERT INTO import_workflows (id, user_id, cv_hash, remaining_ai_uses, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      [workflowId, userId, cvHash, expiresAt.toISOString(), now, now],
    );
  }

  async tryConsumeImportUse(workflowId: string, userId: string, cvHash: string, now: Date): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE import_workflows SET remaining_ai_uses = remaining_ai_uses - 1, updated_at = ?
       WHERE id = ? AND user_id = ? AND cv_hash = ? AND expires_at > ? AND remaining_ai_uses > 0`,
      [now.toISOString(), workflowId, userId, cvHash, now.toISOString()],
    );
    return result.affectedRows === 1;
  }
}

class MysqlPhotoRepository implements PhotoRepository {
  constructor(private readonly pool: Pool, private readonly generateId: () => string, private readonly now: () => Date) {}

  async list(userId: string): Promise<PhotoRecord[]> {
    const [rows] = await this.pool.query<PhotoRow[]>(
      `SELECT id, name, data_url AS dataUrl, created_at AS createdAt
       FROM user_photos WHERE user_id = ? ORDER BY created_at DESC, id ASC`,
      [userId],
    );
    return rows;
  }

  async save(userId: string, name: string, dataUrl: string, maxPhotos: number): Promise<SavedPhoto> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = this.generateId();
      const connection = await this.pool.getConnection();
      try {
        await connection.beginTransaction();
        const [photos] = await connection.query<(RowDataPacket & { id: string })[]>(
          "SELECT id FROM user_photos WHERE user_id = ? ORDER BY created_at ASC, id ASC FOR UPDATE",
          [userId],
        );
        let deletedOldest = false;
        if (maxPhotos > 0 && photos.length >= maxPhotos) {
          await connection.execute("DELETE FROM user_photos WHERE id = ? AND user_id = ?", [photos[0]!.id, userId]);
          deletedOldest = true;
        }
        await connection.execute(
          "INSERT INTO user_photos (id, user_id, name, data_url, created_at) VALUES (?, ?, ?, ?, ?)",
          [id, userId, name, dataUrl, this.now().toISOString()],
        );
        await connection.commit();
        return { id, deletedOldest };
      } catch (error) {
        await connection.rollback();
        if (!isDuplicateEntry(error)) throw error;
      } finally {
        connection.release();
      }
    }
    throw new Error("Unable to generate a unique photo id");
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM user_photos WHERE id = ? AND user_id = ?", [id, userId]);
    return result.affectedRows === 1;
  }
}

class MysqlPdfArchiveRepository implements PdfArchiveRepository {
  constructor(private readonly pool: Pool, private readonly now: () => Date) {}

  async tryCommitExport(
    userId: string,
    date: string,
    record: PdfArchiveRecord,
    limits: PdfExportLimits,
  ): Promise<PdfExportCommitResult> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("SELECT id FROM pdf_quota_settings WHERE id = 1 FOR UPDATE");
      if (record.contentHash) {
        const [duplicates] = await connection.query<PdfArchiveRow[]>(
          `SELECT id, filename, object_key AS objectKey, size_bytes AS sizeBytes,
            content_hash AS contentHash, created_at AS createdAt
           FROM pdf_archives WHERE user_id = ? AND content_hash = ? FOR UPDATE`,
          [userId, record.contentHash],
        );
        if (duplicates[0]) {
          await connection.rollback();
          return { status: "duplicate", archive: mapPdfArchive(duplicates[0]) };
        }
      }

      const [usageRows] = await connection.query<(RowDataPacket & { count: number })[]>(
        "SELECT count FROM pdf_export_usage WHERE user_id = ? AND usage_date = ? FOR UPDATE",
        [userId, date],
      );
      if (limits.daily !== null && Number(usageRows[0]?.count ?? 0) >= limits.daily) {
        await connection.rollback();
        return { status: "daily_limit_reached" };
      }

      const [archives] = await connection.query<(RowDataPacket & { id: string; sizeBytes: number | string })[]>(
        "SELECT id, size_bytes AS sizeBytes FROM pdf_archives WHERE user_id = ? FOR UPDATE",
        [userId],
      );
      if (archives.length >= limits.maxArchivedPdfs) {
        await connection.rollback();
        return { status: "archive_count_limit_reached" };
      }
      const totalBytes = archives.reduce((total, archive) => total + Number(archive.sizeBytes), 0);
      if (totalBytes + record.sizeBytes > limits.maxArchivedPdfBytes) {
        await connection.rollback();
        return { status: "archive_size_limit_reached" };
      }

      await connection.execute(
        `INSERT INTO pdf_archives (id, user_id, filename, object_key, size_bytes, content_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [record.id, userId, record.filename, record.objectKey, record.sizeBytes, record.contentHash, record.createdAt],
      );
      await connection.execute(
        `INSERT INTO pdf_export_usage (user_id, usage_date, count, updated_at) VALUES (?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE count = count + 1, updated_at = VALUES(updated_at)`,
        [userId, date, this.now().toISOString()],
      );
      await connection.commit();
      return { status: "created" };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async list(userId: string, limit: number): Promise<PdfArchiveRecord[]> {
    const [rows] = await this.pool.query<PdfArchiveRow[]>(
      `SELECT id, filename, object_key AS objectKey, size_bytes AS sizeBytes,
        content_hash AS contentHash, created_at AS createdAt
       FROM pdf_archives WHERE user_id = ? ORDER BY created_at DESC, id ASC LIMIT ?`,
      [userId, normalizedLimit(limit)],
    );
    return rows.map(mapPdfArchive);
  }

  async findByHash(userId: string, contentHash: string): Promise<PdfArchiveRecord | null> {
    return this.findOne("user_id = ? AND content_hash = ?", [userId, contentHash]);
  }

  async findByFilename(userId: string, filename: string): Promise<PdfArchiveRecord | null> {
    return this.findOne("user_id = ? AND filename = ?", [userId, filename]);
  }

  async find(userId: string, id: string): Promise<PdfArchiveRecord | null> {
    return this.findOne("user_id = ? AND id = ?", [userId, id]);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM pdf_archives WHERE id = ? AND user_id = ?", [id, userId]);
    return result.affectedRows === 1;
  }

  private async findOne(where: string, values: unknown[]): Promise<PdfArchiveRecord | null> {
    const [rows] = await this.pool.query<PdfArchiveRow[]>(
      `SELECT id, filename, object_key AS objectKey, size_bytes AS sizeBytes,
        content_hash AS contentHash, created_at AS createdAt FROM pdf_archives WHERE ${where}`,
      values,
    );
    return rows[0] ? mapPdfArchive(rows[0]) : null;
  }
}

class MysqlPdfQuotaSettingsRepository implements PdfQuotaSettingsRepository {
  constructor(private readonly pool: Pool, private readonly now: () => Date) {}

  async get(): Promise<PdfQuotaSettings> {
    const [rows] = await this.pool.query<(RowDataPacket & PdfQuotaSettings)[]>(
      `SELECT default_daily AS defaultDaily, friend_daily AS friendDaily,
        super_admin_daily AS superAdminDaily, max_archived_pdfs AS maxArchivedPdfs,
        max_archived_pdf_bytes AS maxArchivedPdfBytes FROM pdf_quota_settings WHERE id = 1`,
    );
    return rows[0] ? normalizeQuotaSettings(rows[0]) : structuredClone(DEFAULT_PDF_QUOTA_SETTINGS);
  }

  async update(settings: PdfQuotaSettings): Promise<void> {
    await this.pool.execute(
      `INSERT INTO pdf_quota_settings (
        id, default_daily, friend_daily, super_admin_daily, max_archived_pdfs, max_archived_pdf_bytes, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        default_daily = VALUES(default_daily), friend_daily = VALUES(friend_daily),
        super_admin_daily = VALUES(super_admin_daily), max_archived_pdfs = VALUES(max_archived_pdfs),
        max_archived_pdf_bytes = VALUES(max_archived_pdf_bytes), updated_at = VALUES(updated_at)`,
      [settings.defaultDaily, settings.friendDaily, settings.superAdminDaily, settings.maxArchivedPdfs,
        settings.maxArchivedPdfBytes, this.now().toISOString()],
    );
  }
}

class MysqlAdminMetricsRepository implements AdminMetricsRepository {
  constructor(private readonly pool: Pool) {}

  async getMetrics(): Promise<AdminMetrics> {
    const [[totalsRows], [savedRows], [usageRows], [topRows], [recentRows]] = await Promise.all([
      this.pool.query<(RowDataPacket & AdminMetrics["totals"])[]>(
        "SELECT COUNT(*) AS applications, COUNT(DISTINCT user_id) AS users, COUNT(DISTINCT company) AS companies FROM applications",
      ),
      this.pool.query<(RowDataPacket & AdminMetrics["savedCvs"])[]>("SELECT COUNT(*) AS savedCvs FROM saved_cvs"),
      this.pool.query<(RowDataPacket & AdminMetrics["usage"])[]>(
        "SELECT COALESCE(SUM(count), 0) AS aiUses, COUNT(DISTINCT user_id) AS aiUsers FROM daily_usage",
      ),
      this.pool.query<(RowDataPacket & AdminMetrics["topCompanies"][number])[]>(
        "SELECT company, COUNT(*) AS applications FROM applications GROUP BY company ORDER BY applications DESC, company ASC LIMIT 8",
      ),
      this.pool.query<(RowDataPacket & AdminMetrics["recentApplications"][number])[]>(
        `SELECT company, role, status, language, style, created_at AS createdAt
         FROM applications ORDER BY created_at DESC, id ASC LIMIT 8`,
      ),
    ]);
    return {
      totals: numericObject(totalsRows[0]!, ["applications", "users", "companies"]),
      savedCvs: numericObject(savedRows[0]!, ["savedCvs"]),
      usage: numericObject(usageRows[0]!, ["aiUses", "aiUsers"]),
      topCompanies: topRows.map((row) => ({ company: row.company, applications: Number(row.applications) })),
      recentApplications: recentRows,
    };
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
    cv: typeof row.cvJson === "string" ? JSON.parse(row.cvJson) : row.cvJson,
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

function numericObject<T extends Record<string, unknown>, K extends keyof T>(value: T, keys: readonly K[]): T {
  const result = { ...value };
  for (const key of keys) result[key] = Number(value[key]) as T[K];
  return result;
}

function normalizedLimit(limit: number): number {
  return Math.max(0, Math.trunc(limit));
}

function isDuplicateEntry(error: unknown): boolean {
  return error !== null && typeof error === "object" && "errno" in error && error.errno === 1062;
}
