import { CV_STYLES, CV_TEMPLATES } from "@nomcci/cvmaker-domain";
import type { CvData, CvStyle, CvTemplate, Locale } from "./types";
import type { WizardStep } from "./wizard";

const LEGACY_DRAFT_KEY = "cvmaker_unsaved_draft_v1";
const DRAFT_PREFIX = "cvmaker_unsaved_draft_v2:";

export interface CvDraftData {
  step: WizardStep;
  maxStep: number;
  sourceMode: "manual" | "import";
  cv: CvData;
  html: string;
  template: CvTemplate;
  style: CvStyle;
  cvLanguage: Locale;
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
  version: 2;
  userId: string;
  data: CvDraftData;
}

export function draftKey(userId: string): string {
  return `${DRAFT_PREFIX}${encodeURIComponent(userId)}`;
}

export function loadDraft(storage: Storage, userId: string): CvDraftData | null {
  storage.removeItem(LEGACY_DRAFT_KEY);
  const serialized = storage.getItem(draftKey(userId));
  if (!serialized) return null;
  try {
    const envelope = JSON.parse(serialized) as Partial<DraftEnvelope>;
    if (envelope.version !== 2 || envelope.userId !== userId) return null;
    return normalizeDraftData(envelope.data);
  } catch {
    return null;
  }
}

export function saveDraft(storage: Storage, userId: string, data: CvDraftData): void {
  const envelope: DraftEnvelope = { version: 2, userId, data };
  storage.setItem(draftKey(userId), JSON.stringify(envelope));
}

export function clearDraft(storage: Storage, userId: string): void {
  storage.removeItem(draftKey(userId));
}

function normalizeDraftData(value: unknown): CvDraftData | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<CvDraftData> & {
    step?: WizardStep | number;
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
    || (draft.cvLanguage !== "en" && draft.cvLanguage !== "es")
  ) return null;

  return {
    step,
    maxStep: draft.maxStep,
    sourceMode: draft.sourceMode,
    cv: draft.cv,
    html: typeof draft.html === "string" ? draft.html : "",
    template: draft.template as CvTemplate,
    style: draft.style as CvStyle,
    cvLanguage: draft.cvLanguage,
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
