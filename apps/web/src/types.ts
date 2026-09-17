import type { CvData, CvStyle, CvTemplate, Language } from "@nomcci/cvmaker-domain";

export type { CvData, CvStyle, CvTemplate } from "@nomcci/cvmaker-domain";
export type Locale = Language;

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
