import { createBlankCv, type CvData, type CvStyle, type CvTemplate } from "@nomcci/cvmaker-domain";
import type { CvDraftData } from "./draft-store";

export const WIZARD_STEPS = ["template", "source", "preview", "improve"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface TemplateChoice {
  id: CvStyle;
  template: CvTemplate;
  style: CvStyle;
}

export const TEMPLATE_CHOICES: readonly TemplateChoice[] = [
  { id: "sidebar_green", template: "cv_sidebar", style: "sidebar_green" },
  { id: "sidebar_compact", template: "cv_sidebar", style: "sidebar_compact" },
  { id: "modern", template: "cv_base", style: "modern" },
  { id: "minimal", template: "cv_base", style: "minimal" },
  { id: "classic", template: "cv_base", style: "classic" },
  { id: "executive", template: "cv_base", style: "executive" },
];

export interface WizardState {
  step: WizardStep;
  maxStep: number;
  choice: TemplateChoice;
  cv: CvData;
  html: string;
  previewStale: boolean;
  importWorkflowId: string | null;
  importedOriginalCv: CvData | null;
  previousCv: CvData | null;
}

export type WizardAction =
  | { type: "reset" }
  | { type: "selectTemplate"; choice: TemplateChoice }
  | { type: "updateCv"; cv: CvData }
  | { type: "imported"; cv: CvData; importWorkflowId: string }
  | { type: "aiApplied"; cv: CvData; html: string; consumedImportWorkflow: boolean }
  | { type: "undoAi"; html: string }
  | { type: "restoreDraft"; draft: CvDraftData }
  | { type: "goTo"; step: WizardStep }
  | { type: "rendered"; html: string };

export function createWizardState(): WizardState {
  const cv = createBlankCv();
  cv.experience = [{ role: "", company: "", location: "", start_date: "", end_date: "", description: [] }];
  return {
    step: "template",
    maxStep: 0,
    choice: TEMPLATE_CHOICES[0]!,
    cv,
    html: "",
    previewStale: false,
    importWorkflowId: null,
    importedOriginalCv: null,
    previousCv: null,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  if (action.type === "reset") return createWizardState();
  if (action.type === "restoreDraft") {
    const choice = TEMPLATE_CHOICES.find(({ template, style }) => template === action.draft.template && style === action.draft.style);
    if (!choice) return state;
    return {
      ...state,
      step: action.draft.step,
      maxStep: Math.max(action.draft.maxStep, WIZARD_STEPS.indexOf(action.draft.step)),
      choice,
      cv: action.draft.cv,
      html: action.draft.html,
      previewStale: false,
      importWorkflowId: action.draft.importWorkflowId,
      importedOriginalCv: action.draft.importedOriginalCv,
      previousCv: null,
    };
  }
  if (action.type === "selectTemplate") {
    return { ...state, choice: action.choice, previewStale: Boolean(state.html) };
  }
  if (action.type === "updateCv") {
    return { ...state, cv: action.cv, previewStale: Boolean(state.html) };
  }
  if (action.type === "imported") {
    return { ...state, cv: action.cv, importWorkflowId: action.importWorkflowId, importedOriginalCv: action.cv };
  }
  if (action.type === "aiApplied") {
    return {
      ...state,
      previousCv: state.cv,
      cv: action.cv,
      html: action.html,
      importWorkflowId: action.consumedImportWorkflow ? null : state.importWorkflowId,
      previewStale: false,
    };
  }
  if (action.type === "undoAi") {
    if (!state.previousCv) return state;
    return { ...state, cv: state.previousCv, previousCv: null, html: action.html, previewStale: false };
  }
  if (action.type === "rendered") {
    return { ...state, html: action.html, previewStale: false, step: "preview", maxStep: Math.max(state.maxStep, 2) };
  }

  const nextIndex = WIZARD_STEPS.indexOf(action.step);
  if (nextIndex > state.maxStep + 1) return state;
  return { ...state, step: action.step, maxStep: Math.max(state.maxStep, nextIndex) };
}
