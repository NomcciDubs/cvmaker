// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearDraft, draftKey, loadDraft, saveDraft, type CvDraftData } from "./draft-store";

const draft: CvDraftData = {
  step: "source",
  maxStep: 1,
  sourceMode: "import",
  cv: { personal_info: { full_name: "Ada Lovelace" } },
  html: "",
  template: "cv_base",
  style: "classic",
  cvLanguage: "en",
  sourceInput: "Ada's CV",
  importName: "ada",
  cvName: "Ada CV",
  importWorkflowId: null,
  importedOriginalCv: null,
  targetRole: "Engineer",
  jobDescription: "",
  instruction: "",
  updatedAt: "2026-09-16T00:00:00.000Z",
};

describe("draft store", () => {
  beforeEach(() => localStorage.clear());

  it("scopes version 2 drafts to the encoded user id", () => {
    saveDraft(localStorage, "user/a", draft);
    expect(draftKey("user/a")).toBe("cvmaker_unsaved_draft_v2:user%2Fa");
    expect(loadDraft(localStorage, "user/a")).toEqual(draft);
    expect(loadDraft(localStorage, "user-b")).toBeNull();
  });

  it("ignores corrupt, wrong-version, and wrong-user data", () => {
    localStorage.setItem(draftKey("user-a"), "not-json");
    expect(loadDraft(localStorage, "user-a")).toBeNull();
    localStorage.setItem(draftKey("user-a"), JSON.stringify({ version: 1, userId: "user-a", data: draft }));
    expect(loadDraft(localStorage, "user-a")).toBeNull();
    localStorage.setItem(draftKey("user-a"), JSON.stringify({ version: 2, userId: "user-b", data: draft }));
    expect(loadDraft(localStorage, "user-a")).toBeNull();
  });

  it("normalizes the legacy version 2 numeric step and improvement object", () => {
    localStorage.setItem(draftKey("user-a"), JSON.stringify({
      version: 2,
      userId: "user-a",
      data: {
        ...draft,
        step: 4,
        importName: undefined,
        targetRole: undefined,
        jobDescription: undefined,
        instruction: undefined,
        improvement: { targetRole: "Architect", jobDescription: "Distributed systems", instruction: "Be concise" },
      },
    }));

    expect(loadDraft(localStorage, "user-a")).toEqual(expect.objectContaining({
      step: "improve",
      importName: "",
      targetRole: "Architect",
      jobDescription: "Distributed systems",
      instruction: "Be concise",
    }));
  });

  it("clears only the current user's draft", () => {
    saveDraft(localStorage, "user-a", draft);
    saveDraft(localStorage, "user-b", draft);
    clearDraft(localStorage, "user-a");
    expect(loadDraft(localStorage, "user-a")).toBeNull();
    expect(loadDraft(localStorage, "user-b")).toEqual(draft);
  });
});
