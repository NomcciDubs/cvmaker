import type {
  AdminMetricsRepository,
  ApplicationRepository,
  CvInputRepository,
  CvRepository,
  PdfArchiveRepository,
  PdfQuotaSettingsRepository,
  PhotoRepository,
  UsageRepository,
} from "@nomcci/cvmaker-application";
import type { SavedCvInput } from "@nomcci/cvmaker-domain";

export interface SavedCvRecord extends SavedCvInput {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClosableCvRepository extends CvRepository {
  list(userId: string): Promise<SavedCvRecord[]>;
  save(userId: string, input: SavedCvInput): Promise<SavedCvRecord>;
  close(): Promise<void>;
}

export interface ClosableDatabaseRepositories {
  cvs: CvRepository;
  cvInputs: CvInputRepository;
  applications: ApplicationRepository;
  usage: UsageRepository;
  photos: PhotoRepository;
  pdfArchives: PdfArchiveRepository;
  pdfQuotas: PdfQuotaSettingsRepository;
  adminMetrics: AdminMetricsRepository;
  close(): Promise<void>;
}

export interface RepositoryDependencies {
  generateId?: () => string;
  now?: () => Date;
}

export type DatabaseDialect = "sqlite" | "mysql";

export interface DatabaseEnvironment {
  DATABASE_DIALECT?: string;
  DATABASE_URL?: string;
}

export class CvIdCollisionError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`CV id is already owned by another user: ${id}`);
    this.name = "CvIdCollisionError";
    this.id = id;
  }
}
