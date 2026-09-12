export type Locale = "en" | "es";
export type CvStyle = "modern" | "minimal" | "classic" | "executive" | "sidebar_compact" | "sidebar_green";
export type CvTemplate = "cv_base" | "cv_sidebar";

export interface CvData {
  personal_info: {
    full_name: string;
    title: string;
    email: string;
    phone: string;
    location: string;
    links: Array<{ label: string; url: string }>;
  };
  summary: string;
  experience: Array<{
    role: string;
    company: string;
    location: string;
    start_date: string;
    end_date: string;
    description: string[];
  }>;
  education: Array<unknown>;
  skills: Array<unknown>;
  languages: Array<unknown>;
}

export interface RenderCvRequest {
  cv: CvData;
  style: CvStyle;
  template: CvTemplate;
  language: Locale;
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
