import { CV_STYLES, CV_TEMPLATES, resolveCvLanguage } from "@nomcci/cvmaker-domain";
import type { CvData, CvLanguage, CvStyle, CvTemplate } from "./types";
import type { WizardStep } from "./wizard";

const LEGACY_DRAFT_KEY = "cvmaker_unsaved_draft_v1";
const LEGACY_DRAFT_PREFIX = "cvmaker_unsaved_draft_v2:";
const DRAFT_PREFIX = "cvmaker_unsaved_draft_v3:";

export interface CvDraftData {
  step: WizardStep;
  maxStep: number;
  sourceMode: "manual" | "import";
  cv: CvData;
  html: string;
  template: CvTemplate;
  style: CvStyle;
  documentLanguage: CvLanguage;
  aiTargetLanguage: CvLanguage;
  sourceInput: string;
  importName: string;
  cvName: string;
  importWorkflowId: string | null;
  importedOriginalCv: CvData | null;
  targetRole: string;
  jobDescription: string;
  instruction: string;
  updatedAt: string;
}

interface DraftEnvelope {
  version: 3;
  userId: string;
  data: CvDraftData;
}

export function draftKey(userId: string): string {
  return `${DRAFT_PREFIX}${encodeURIComponent(userId)}`;
}

export function loadDraft(storage: Storage, userId: string): CvDraftData | null {
  try {
    storage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
  const current = readEnvelope(storage, draftKey(userId), userId, 3);
  if (current) return current;
  return migrateLegacyDraft(storage, userId);
}

function readEnvelope(storage: Storage, key: string, userId: string, version: number): CvDraftData | null {
  let serialized: string | null = null;
  try {
    serialized = storage.getItem(key);
  } catch {
    return null;
  }
  if (!serialized) return null;
  try {
    const envelope = JSON.parse(serialized) as { version?: unknown; userId?: unknown; data?: unknown };
    if (envelope.version !== version || envelope.userId !== userId) return null;
    return normalizeDraftData(envelope.data);
  } catch {
    return null;
  }
}

function migrateLegacyDraft(storage: Storage, userId: string): CvDraftData | null {
  const legacyKey = `${LEGACY_DRAFT_PREFIX}${encodeURIComponent(userId)}`;
  const migrated = readEnvelope(storage, legacyKey, userId, 2);
  if (!migrated) return null;
  try {
    saveDraft(storage, userId, migrated);
  } catch {
    return migrated;
  }
  try {
    storage.removeItem(legacyKey);
  } catch {
    /* keep the migrated copy; the legacy key is harmless */
  }
  return migrated;
}

export function saveDraft(storage: Storage, userId: string, data: CvDraftData): void {
  const envelope: DraftEnvelope = { version: 3, userId, data };
  storage.setItem(draftKey(userId), JSON.stringify(envelope));
}

export function clearDraft(storage: Storage, userId: string): void {
  storage.removeItem(draftKey(userId));
}

function normalizeDraftData(value: unknown): CvDraftData | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<CvDraftData> & {
    step?: WizardStep | number;
    cvLanguage?: unknown;
    improvement?: { targetRole?: unknown; jobDescription?: unknown; instruction?: unknown };
  };
  const step = typeof draft.step === "number"
    ? (["template", "source", "preview", "improve"] as const)[draft.step - 1]
    : draft.step;
  if (
    !step
    || typeof draft.maxStep !== "number"
    || (draft.sourceMode !== "manual" && draft.sourceMode !== "import")
    || !draft.cv || typeof draft.cv !== "object"
    || !draft.cv.personal_info || typeof draft.cv.personal_info.full_name !== "string"
    || !CV_TEMPLATES.includes(draft.template as CvTemplate)
    || !CV_STYLES.includes(draft.style as CvStyle)
  ) return null;

  const documentLanguage = resolveCvLanguage(draft.documentLanguage ?? draft.cvLanguage);

  return {
    step,
    maxStep: draft.maxStep,
    sourceMode: draft.sourceMode,
    cv: draft.cv,
    html: typeof draft.html === "string" ? draft.html : "",
    template: draft.template as CvTemplate,
    style: draft.style as CvStyle,
    documentLanguage,
    aiTargetLanguage: resolveCvLanguage(draft.aiTargetLanguage ?? documentLanguage),
    sourceInput: typeof draft.sourceInput === "string" ? draft.sourceInput : "",
    importName: typeof draft.importName === "string" ? draft.importName : "",
    cvName: typeof draft.cvName === "string" ? draft.cvName : "",
    importWorkflowId: typeof draft.importWorkflowId === "string" ? draft.importWorkflowId : null,
    importedOriginalCv: draft.importedOriginalCv && typeof draft.importedOriginalCv === "object" ? draft.importedOriginalCv : null,
    targetRole: stringValue(draft.targetRole ?? draft.improvement?.targetRole),
    jobDescription: stringValue(draft.jobDescription ?? draft.improvement?.jobDescription),
    instruction: stringValue(draft.instruction ?? draft.improvement?.instruction),
    updatedAt: typeof draft.updatedAt === "string" ? draft.updatedAt : new Date(0).toISOString(),
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
