export const LANGUAGES = ["en", "es"] as const;
export const CV_STYLES = ["modern", "minimal", "classic", "executive", "sidebar_compact", "sidebar_green"] as const;
export const CV_TEMPLATES = ["cv_base", "cv_sidebar"] as const;
export const CV_SOURCE_TYPES = ["manual", "import", "ai", "edit", "output"] as const;

export type Language = (typeof LANGUAGES)[number];
export type CvStyle = (typeof CV_STYLES)[number];
export type CvTemplate = (typeof CV_TEMPLATES)[number];
export type CvSourceType = (typeof CV_SOURCE_TYPES)[number];

export const CV_LANGUAGES = [
  "en",
  "es",
  "pt",
  "fr",
  "de",
  "it",
  "nl",
  "pl",
  "tr",
  "id",
  "vi",
  "ro",
] as const;

export type CvLanguage = (typeof CV_LANGUAGES)[number];

export interface CvLanguageInfo {
  code: CvLanguage;
  bcp47: string;
  direction: "ltr";
  nameEn: string;
  nameEs: string;
  nameNative: string;
  aliases: readonly string[];
}

export const CV_LANGUAGE_CATALOG: readonly CvLanguageInfo[] = [
  { code: "en", bcp47: "en", direction: "ltr", nameEn: "English", nameEs: "Inglés", nameNative: "English", aliases: ["en", "english", "ingles", "inglés"] },
  { code: "es", bcp47: "es", direction: "ltr", nameEn: "Spanish", nameEs: "Español", nameNative: "Español", aliases: ["es", "spanish", "espanol", "español", "castellano", "castilian"] },
  { code: "pt", bcp47: "pt", direction: "ltr", nameEn: "Portuguese", nameEs: "Portugués", nameNative: "Português", aliases: ["pt", "portuguese", "portugues", "português", "brasil", "brazil", "brasileiro", "brazilian"] },
  { code: "fr", bcp47: "fr", direction: "ltr", nameEn: "French", nameEs: "Francés", nameNative: "Français", aliases: ["fr", "french", "frances", "francés", "francais", "français"] },
  { code: "de", bcp47: "de", direction: "ltr", nameEn: "German", nameEs: "Alemán", nameNative: "Deutsch", aliases: ["de", "german", "aleman", "alemán", "deutsch"] },
  { code: "it", bcp47: "it", direction: "ltr", nameEn: "Italian", nameEs: "Italiano", nameNative: "Italiano", aliases: ["it", "italian", "italiano", "italia", "italy"] },
  { code: "nl", bcp47: "nl", direction: "ltr", nameEn: "Dutch", nameEs: "Neerlandés", nameNative: "Nederlands", aliases: ["nl", "dutch", "neerlandes", "neerlandés", "nederlands", "holandes", "holandés", "holland"] },
  { code: "pl", bcp47: "pl", direction: "ltr", nameEn: "Polish", nameEs: "Polaco", nameNative: "Polski", aliases: ["pl", "polish", "polaco", "polski", "polska", "poland"] },
  { code: "tr", bcp47: "tr", direction: "ltr", nameEn: "Turkish", nameEs: "Turco", nameNative: "Türkçe", aliases: ["tr", "turkish", "turco", "turkce", "türkçe"] },
  { code: "id", bcp47: "id", direction: "ltr", nameEn: "Indonesian", nameEs: "Indonesio", nameNative: "Bahasa Indonesia", aliases: ["id", "indonesian", "indonesio", "indonesia", "bahasa"] },
  { code: "vi", bcp47: "vi", direction: "ltr", nameEn: "Vietnamese", nameEs: "Vietnamita", nameNative: "Tiếng Việt", aliases: ["vi", "vietnamese", "vietnamita", "vietnam", "tieng", "tiếng"] },
  { code: "ro", bcp47: "ro", direction: "ltr", nameEn: "Romanian", nameEs: "Rumano", nameNative: "Română", aliases: ["ro", "romanian", "rumano", "romana", "română"] },
];

export function isCvLanguage(value: unknown): value is CvLanguage {
  return typeof value === "string" && (CV_LANGUAGES as readonly string[]).includes(value);
}

export function cvLanguageInfo(code: CvLanguage): CvLanguageInfo {
  return CV_LANGUAGE_CATALOG.find((entry) => entry.code === code) ?? CV_LANGUAGE_CATALOG[0]!;
}

export function resolveCvLanguage(value: unknown): CvLanguage {
  return isCvLanguage(value) ? value : "en";
}

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

export interface CvLanguageEntry {
  name: string;
  level?: string;
}

export interface CvData {
  personal_info: PersonalInfo;
  summary?: string;
  experience?: Experience[];
  education?: Education[];
  skills?: SkillGroup[];
  languages?: CvLanguageEntry[];
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
  language: CvLanguage;
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
