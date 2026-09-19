import type { CvData, CvLanguage, CvSourceType, CvStyle, CvTemplate, SavedCvInput } from "@nomcci/cvmaker-domain";

import type { SavedCvRecord } from "./types";

export interface SavedCvRow {
  id: string;
  user_id: string;
  name: string;
  source_type: string;
  source_input: string | null;
  target_role: string | null;
  cv_json: unknown;
  cv_html: string;
  language: string;
  style: string;
  template: string;
  created_at: string;
  updated_at: string;
}

export function mapSavedCvRow(row: SavedCvRow): SavedCvRecord {
  return {
    id: row.id,
    ownerId: row.user_id,
    name: row.name,
    sourceType: row.source_type as CvSourceType,
    ...(row.source_input === null ? {} : { sourceInput: row.source_input }),
    ...(row.target_role === null ? {} : { targetRole: row.target_role }),
    cv: parseCvJson(row.cv_json),
    html: row.cv_html,
    language: row.language as CvLanguage,
    style: row.style as CvStyle,
    template: row.template as CvTemplate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function savedCvValues(id: string, userId: string, input: SavedCvInput, now: string): Array<string | null> {
  return [
    id,
    userId,
    input.name,
    input.sourceType,
    input.sourceInput ?? null,
    input.targetRole ?? null,
    JSON.stringify(input.cv),
    input.html,
    input.language,
    input.style,
    input.template,
    now,
    now,
  ];
}

export function savedCvUpdateValues(input: SavedCvInput, now: string, id: string, userId: string): Array<string | null> {
  return [
    input.name,
    input.sourceType,
    input.sourceInput ?? null,
    input.targetRole ?? null,
    JSON.stringify(input.cv),
    input.html,
    input.language,
    input.style,
    input.template,
    now,
    id,
    userId,
  ];
}

function parseCvJson(value: unknown): CvData {
  if (typeof value === "string") return JSON.parse(value) as CvData;
  if (Buffer.isBuffer(value)) return JSON.parse(value.toString("utf8")) as CvData;
  if (value !== null && typeof value === "object") return value as CvData;
  throw new TypeError("saved_cvs.cv_json is not valid JSON");
}
