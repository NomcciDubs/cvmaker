import { describe, expect, it, vi } from "vitest";

import type { ChatModel, ChatModelRequest } from "@nomcci/cvmaker-application";
import type { CvData } from "@nomcci/cvmaker-domain";

import { PortableCvAiService } from "./index";

const cv: CvData = {
  personal_info: { full_name: "Ada Lovelace" },
  summary: "Mathematician",
  experience: [],
  education: [],
  skills: [],
  languages: [],
};

function modelWith(...responses: string[]): ChatModel & { complete: ReturnType<typeof vi.fn> } {
  return { complete: vi.fn(async () => responses.shift() ?? JSON.stringify(cv)) };
}

describe("PortableCvAiService prompts", () => {
  it.each([
    ["en" as const, "English"],
    ["pt" as const, "Portuguese"],
    ["vi" as const, "Vietnamese"],
  ])("builds the stable import prompt naming the %s output language", async (language, output) => {
    const model = modelWith(JSON.stringify(cv));
    await new PortableCvAiService(model).import("source resume", language);

    const request = model.complete.mock.calls[0]![0] as ChatModelRequest;
    expect(request).toMatchObject({ temperature: 0.2, responseFormat: "json" });
    expect(request.messages[0]?.content).toContain("Convert this resume");
    expect(request.messages[0]?.content).toContain(`in ${output}`);
    expect(request.messages[0]?.content).toContain("Clean resume:\nsource resume");
    expect(request.messages[0]?.content).toContain("personal_info");
  });

  it("builds rewrite and modify prompts with optional job context", async () => {
    const model = modelWith(JSON.stringify(cv), JSON.stringify(cv));
    const service = new PortableCvAiService(model);
    await service.rewrite(cv, "Engineer", "Needs TypeScript", "en");
    await service.modify(cv, "Destaca liderazgo", "Busca un lider", "es");

    const rewrite = (model.complete.mock.calls[0]![0] as ChatModelRequest).messages[0]!.content;
    const modify = (model.complete.mock.calls[1]![0] as ChatModelRequest).messages[0]!.content;
    expect(rewrite).toContain("Target role:\nEngineer");
    expect(rewrite).toContain("Job description");
    expect(rewrite).toContain("Needs TypeScript");
    expect(rewrite).toContain("in English");
    expect(modify).toContain("Instruction:\nDestaca liderazgo");
    expect(modify).toContain("Job description");
    expect(modify).toContain("in Spanish");
  });

  it.each([
    ["en" as const, "into English"],
    ["es" as const, "into Spanish"],
    ["ro" as const, "into Romanian"],
  ])("requests translation into the selected language", async (language, expected) => {
    const model = modelWith(JSON.stringify(cv));
    await new PortableCvAiService(model).translate(cv, language);
    expect((model.complete.mock.calls[0]![0] as ChatModelRequest).messages[0]!.content).toContain(expected);
  });
});

describe("PortableCvAiService parsing and normalization", () => {
  it("parses fenced JSON and normalizes imported sections with source language fallback", async () => {
    const draft = {
      personal_info: { full_name: "Ada", email: "ada@example.test" },
      experience: [{ role: "", company: "" }, { role: "Engineer", company: "Engine" }],
      education: [{ degree: "BSc", school: "University" }, { degree: "", institution: "" }],
      skills: [{ name: "", items: [] }, { name: "Tools", items: ["TS"] }],
      languages: [{ name: "" }],
    };
    const model = modelWith(`\n\`\`\`json\n${JSON.stringify(draft)}\n\`\`\`\n`);
    const result = await new PortableCvAiService(model).import("Profile\nLanguages\n- English; Spanish\nExperience", "en");

    expect(result.personal_info.links).toEqual([]);
    expect(result.summary).toBe("");
    expect(result.experience).toEqual([{ role: "Engineer", company: "Engine" }]);
    expect(result.education).toEqual([{ degree: "BSc", school: "University", institution: "University" }]);
    expect(result.skills).toEqual([{ name: "Tools", items: ["TS"] }]);
    expect(result.languages).toEqual([{ name: "English" }, { name: "Spanish" }]);
  });

  it("coerces string links from the model into link objects", async () => {
    const draft = {
      personal_info: {
        full_name: "Ada",
        links: ["https://example.com/a", "example.com/b", "", "not a url"],
      },
      experience: [],
      education: [],
      skills: [],
      languages: [],
    };
    const model = modelWith(JSON.stringify(draft));
    const result = await new PortableCvAiService(model).import("Profile", "en");

    expect(result.personal_info.links).toEqual([
      { label: "https://example.com/a", url: "https://example.com/a" },
      { label: "https://example.com/b", url: "https://example.com/b" },
    ]);
  });

  it("rejects model JSON without a full name", async () => {
    const model = modelWith('{"personal_info":{"full_name":""}}');
    await expect(new PortableCvAiService(model).translate(cv, "en")).rejects.toThrow("Invalid CV JSON");
  });

  it("repairs a suspicious concentration of experience bullets", async () => {
    const suspicious = {
      ...cv,
      experience: [
        { role: "First", company: "One", description: ["a", "b", "c", "d"] },
        { role: "Second", company: "Two", description: [] },
      ],
    };
    const repaired = {
      ...suspicious,
      experience: [
        { role: "First", company: "One", description: ["a", "b"] },
        { role: "Second", company: "Two", description: ["c", "d"] },
      ],
    };
    const model = modelWith(JSON.stringify(suspicious), JSON.stringify(repaired));
    const result = await new PortableCvAiService(model).import("source", "en");

    expect(result.experience?.[1]?.description).toEqual(["c", "d"]);
    expect(model.complete).toHaveBeenCalledTimes(2);
    expect((model.complete.mock.calls[1]![0] as ChatModelRequest).messages[0]!.content).toContain("Correct only the experience-description assignments");
  });

  it("can disable repair and falls back to the draft when repair fails", async () => {
    const suspicious = JSON.stringify({
      ...cv,
      experience: [
        { role: "First", company: "One", description: ["a", "b", "c", "d"] },
        { role: "Second", company: "Two", description: [] },
      ],
    });
    const disabledModel = modelWith(suspicious);
    await new PortableCvAiService(disabledModel, { repairSuspiciousExperience: false }).import("source", "en");
    expect(disabledModel.complete).toHaveBeenCalledTimes(1);

    const failingModel = modelWith(suspicious, "not json");
    const result = await new PortableCvAiService(failingModel).import("source", "en");
    expect(result.experience?.[0]?.description).toHaveLength(4);
    expect(failingModel.complete).toHaveBeenCalledTimes(2);
  });
});
