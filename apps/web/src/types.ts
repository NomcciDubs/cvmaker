import type { CvData, CvLanguage, CvSourceType, CvStyle, CvTemplate, SavedCvInput } from "@nomcci/cvmaker-domain";

export type { CvData, CvLanguage, CvStyle, CvTemplate } from "@nomcci/cvmaker-domain";

export type UiLocale = "en" | "es";
export type Locale = UiLocale;

export interface RenderCvRequest {
  cv: CvData;
  style: CvStyle;
  template: CvTemplate;
  language: CvLanguage;
}

export interface ImportCvRequest {
  description: string;
  language: CvLanguage;
}

export interface ImportCvResponse {
  cv: CvData;
  importWorkflowId: string;
}

export interface ModifyCvRequest {
  cv: CvData;
  instruction: string;
  jobDescription?: string;
  language: CvLanguage;
}

export interface ImportImproveRequest extends ModifyCvRequest {
  originalCv: CvData;
  importWorkflowId: string;
  targetRole?: string;
}

export interface CvInputRecord {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedCvRecord extends SavedCvInput {
  id: string;
  ownerId: string;
  sourceType: CvSourceType;
  createdAt: string;
  updatedAt: string;
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

export interface PdfArchiveItem {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  downloadPath: string;
}

export interface ExportPdfResponse {
  downloadPath: string;
  reused?: boolean;
}

export interface ApplicationSnapshot extends RenderCvRequest {
  company: string;
  role: string;
  status?: string;
  jobUrl?: string;
  jobDescription?: string;
  html: string;
}

export interface ApplicationRecord extends ApplicationSnapshot {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminMetrics {
  totals: { applications: number; users: number; companies: number };
  savedCvs: { savedCvs: number };
  usage: { aiUses: number; aiUsers: number };
  topCompanies: Array<{ company: string; applications: number }>;
  recentApplications: Array<{
    company: string;
    role: string;
    status: string;
    language: CvLanguage;
    style: string;
    createdAt: string;
  }>;
}

export interface PdfQuotaSettings {
  defaultDaily: number;
  friendDaily: number;
  superAdminDaily: number | null;
  maxArchivedPdfs: number;
  maxArchivedPdfBytes: number;
}

export interface Session {
  user: {
    id: string;
    email: string;
    name: string | null;
    nickname: string | null;
    country: string | null;
  };
  currentPage: {
    id: string;
    name: string;
    slug: string;
    role: string;
    permissions: string[];
  };
  session: { expiresAt: string };
  usage: { used: number; limit: number | null };
}
