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
});
