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
    if (envelope.version !== 2 || envelope.userId !== userId || !isDraftData(envelope.data)) return null;
    return envelope.data;
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

function isDraftData(value: unknown): value is CvDraftData {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<CvDraftData>;
  return (
    ["template", "source", "preview", "improve"].includes(draft.step ?? "")
    && typeof draft.maxStep === "number"
    && (draft.sourceMode === "manual" || draft.sourceMode === "import")
    && Boolean(draft.cv && typeof draft.cv === "object" && draft.cv.personal_info && typeof draft.cv.personal_info.full_name === "string")
    && typeof draft.html === "string"
    && typeof draft.template === "string"
    && typeof draft.style === "string"
    && (draft.cvLanguage === "en" || draft.cvLanguage === "es")
    && typeof draft.sourceInput === "string"
    && typeof draft.importName === "string"
    && typeof draft.targetRole === "string"
    && typeof draft.jobDescription === "string"
    && typeof draft.instruction === "string"
    && typeof draft.updatedAt === "string"
  );
}
