import { describe, expect, it } from "vitest";
import { createWizardState, TEMPLATE_CHOICES, wizardReducer } from "./wizard";

describe("template catalog", () => {
  it("contains exactly the six supported template and style pairs", () => {
    expect(TEMPLATE_CHOICES).toHaveLength(6);
    expect(new Set(TEMPLATE_CHOICES.map(({ style }) => style)).size).toBe(6);
    expect(TEMPLATE_CHOICES.filter(({ template }) => template === "cv_base")).toHaveLength(4);
    expect(TEMPLATE_CHOICES.filter(({ template }) => template === "cv_sidebar")).toHaveLength(2);
  });
});

describe("wizardReducer", () => {
  it("preserves data while navigating and marks rendered previews stale after edits", () => {
    let state = createWizardState();
    state = wizardReducer(state, { type: "goTo", step: "source" });
    state = wizardReducer(state, { type: "rendered", html: "<article>CV</article>" });
    state = wizardReducer(state, { type: "goTo", step: "source" });
    state = wizardReducer(state, {
      type: "updateCv",
      cv: { ...state.cv, personal_info: { ...state.cv.personal_info, full_name: "Ada" } },
    });

    expect(state.step).toBe("source");
    expect(state.cv.personal_info.full_name).toBe("Ada");
    expect(state.html).toBe("<article>CV</article>");
    expect(state.previewStale).toBe(true);
  });

  it("does not skip locked steps", () => {
    const state = createWizardState();
    expect(wizardReducer(state, { type: "goTo", step: "improve" })).toBe(state);
  });

  it("keeps the original imported CV and workflow allowance", () => {
    const state = createWizardState();
    const cv = { ...state.cv, personal_info: { full_name: "Grace Hopper" } };
    const imported = wizardReducer(state, { type: "imported", cv, importWorkflowId: "workflow-1" });

    expect(imported.cv).toBe(cv);
    expect(imported.importedOriginalCv).toBe(cv);
    expect(imported.importWorkflowId).toBe("workflow-1");
  });

  it("stores one AI undo snapshot and restores it with fresh HTML", () => {
    let state = createWizardState();
    const changedCv = { ...state.cv, summary: "AI summary" };
    state = wizardReducer(state, { type: "aiApplied", cv: changedCv, html: "<p>AI</p>", consumedImportWorkflow: false });

    expect(state.previousCv?.summary).toBe("");
    expect(state.cv.summary).toBe("AI summary");
    state = wizardReducer(state, { type: "undoAi", html: "<p>Original</p>" });
    expect(state.cv.summary).toBe("");
    expect(state.previousCv).toBeNull();
    expect(state.html).toBe("<p>Original</p>");
  });

  it("opens a saved CV directly in the final editing step", () => {
    const state = wizardReducer(createWizardState(), {
      type: "loadSavedCv",
      cv: { personal_info: { full_name: "Saved owner" } },
      html: "<article>Saved</article>",
      template: "cv_base",
      style: "executive",
    });

    expect(state.step).toBe("improve");
    expect(state.maxStep).toBe(3);
    expect(state.choice.style).toBe("executive");
    expect(state.cv.personal_info.full_name).toBe("Saved owner");
    expect(state.html).toBe("<article>Saved</article>");
  });
});
