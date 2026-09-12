export const LANGUAGES = ["en", "es"] as const;
export const CV_STYLES = ["modern", "minimal", "classic", "executive", "sidebar_compact", "sidebar_green"] as const;
export const CV_TEMPLATES = ["cv_base", "cv_sidebar"] as const;
export const CV_SOURCE_TYPES = ["manual", "import", "ai", "edit", "output"] as const;

export type Language = (typeof LANGUAGES)[number];
export type CvStyle = (typeof CV_STYLES)[number];
export type CvTemplate = (typeof CV_TEMPLATES)[number];
export type CvSourceType = (typeof CV_SOURCE_TYPES)[number];

export interface Link {
  label: string;
  url: string;
}

export interface PersonalInfo {
  full_name: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  photo_url?: string;
  links?: Link[];
}

export interface Experience {
  role: string;
  company: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  description?: string[];
}

export interface Education {
  degree: string;
  institution: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  details?: string[];
}

export interface SkillGroup {
  name: string;
  items?: string[];
}

export interface CvLanguage {
  name: string;
  level?: string;
}

export interface CvData {
  personal_info: PersonalInfo;
  summary?: string;
  experience?: Experience[];
  education?: Education[];
  skills?: SkillGroup[];
  languages?: CvLanguage[];
}

export interface Principal {
  id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  country: string | null;
  role: string;
  permissions: string[];
}

export interface RenderOptions {
  style: CvStyle;
  template: CvTemplate;
  language: Language;
}

export interface SavedCvInput extends RenderOptions {
  id?: string;
  name: string;
  sourceType: CvSourceType;
  sourceInput?: string;
  targetRole?: string;
  cv: CvData;
  html: string;
}

export interface ApplicationInput extends RenderOptions {
  company: string;
  role: string;
  status?: string;
  jobUrl?: string;
  jobDescription?: string;
  cv: CvData;
  html: string;
}

export function createBlankCv(): CvData {
  return {
    personal_info: { full_name: "", title: "", email: "", phone: "", location: "", links: [] },
    summary: "",
    experience: [],
    education: [],
    skills: [],
    languages: [],
  };
}

export function aiDailyLimitFor(role: string): number | null {
  if (role === "SUPER_ADMIN") return null;
  return role === "FRIEND" ? 10 : 1;
}

export interface PdfQuotaSettings {
  defaultDaily: number;
  friendDaily: number;
  superAdminDaily: number | null;
  maxArchivedPdfs: number;
  maxArchivedPdfBytes: number;
}

export const DEFAULT_PDF_QUOTA_SETTINGS: PdfQuotaSettings = {
  defaultDaily: 3,
  friendDaily: 20,
  superAdminDaily: null,
  maxArchivedPdfs: 20,
  maxArchivedPdfBytes: 26_214_400,
};

export function pdfDailyLimitFor(role: string, settings: PdfQuotaSettings): number | null {
  if (role === "SUPER_ADMIN") return settings.superAdminDaily;
  return role === "FRIEND" ? settings.friendDaily : settings.defaultDaily;
}
