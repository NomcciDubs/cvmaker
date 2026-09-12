import { z } from "zod";

import { CV_SOURCE_TYPES, CV_STYLES, CV_TEMPLATES, LANGUAGES } from "@nomcci/cvmaker-domain";

const optionalText = z.string().trim().max(10_000).optional();
const shortOptionalText = z.string().trim().max(500).optional();

export const languageSchema = z.enum(LANGUAGES);
export const cvStyleSchema = z.enum(CV_STYLES);
export const cvTemplateSchema = z.enum(CV_TEMPLATES);

export const linkSchema = z.object({
  label: z.string().trim().max(200),
  url: z.url().max(2_048),
});

export const personalInfoSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  title: shortOptionalText,
  email: z.email().max(320).or(z.literal("")).optional(),
  phone: z.string().trim().max(100).optional(),
  location: shortOptionalText,
  photo_url: z.string().max(1_000_000).optional(),
  links: z.array(linkSchema).max(20).optional(),
});

export const cvSchema = z.object({
  personal_info: personalInfoSchema,
  summary: optionalText,
  experience: z.array(z.object({
    role: z.string().trim().max(300),
    company: z.string().trim().max(300),
    location: shortOptionalText,
    start_date: shortOptionalText,
    end_date: shortOptionalText,
    description: z.array(z.string().trim().max(2_000)).max(100).optional(),
  })).max(100).optional(),
  education: z.array(z.object({
    degree: z.string().trim().max(300),
    institution: z.string().trim().max(300),
    location: shortOptionalText,
    start_date: shortOptionalText,
    end_date: shortOptionalText,
    details: z.array(z.string().trim().max(2_000)).max(100).optional(),
  })).max(100).optional(),
  skills: z.array(z.object({
    name: z.string().trim().max(200),
    items: z.array(z.string().trim().max(300)).max(100).optional(),
  })).max(100).optional(),
  languages: z.array(z.object({
    name: z.string().trim().max(200),
    level: shortOptionalText,
  })).max(50).optional(),
});

export const renderOptionsSchema = z.object({
  style: cvStyleSchema,
  template: cvTemplateSchema,
  language: languageSchema,
});

export const renderCvRequestSchema = renderOptionsSchema.extend({ cv: cvSchema });

export const importCvRequestSchema = z.object({
  description: z.string().trim().min(1).max(200_000),
  language: languageSchema,
});

export const rewriteCvRequestSchema = z.object({
  cv: cvSchema,
  targetRole: z.string().trim().min(1).max(500),
  jobDescription: z.string().trim().max(100_000).optional(),
  language: languageSchema,
});

export const modifyCvRequestSchema = z.object({
  cv: cvSchema,
  instruction: z.string().trim().min(1).max(10_000),
  jobDescription: z.string().trim().max(100_000).optional(),
  language: languageSchema,
});

export const translateCvRequestSchema = z.object({
  cv: cvSchema,
  language: languageSchema,
});

export const savedCvInputSchema = renderCvRequestSchema.extend({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(200),
  sourceType: z.enum(CV_SOURCE_TYPES),
  sourceInput: optionalText,
  targetRole: shortOptionalText,
  html: z.string().max(2_000_000),
});

export const applicationInputSchema = renderCvRequestSchema.extend({
  company: z.string().trim().min(1).max(300),
  role: z.string().trim().min(1).max(300),
  status: z.string().trim().max(100).optional(),
  jobUrl: z.url().max(2_048).optional(),
  jobDescription: optionalText,
  html: z.string().max(2_000_000),
});

export type RenderCvRequest = z.infer<typeof renderCvRequestSchema>;
export type SavedCvRequest = z.infer<typeof savedCvInputSchema>;
export type ApplicationRequest = z.infer<typeof applicationInputSchema>;
