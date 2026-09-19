import type { ChatModel, CvAiService } from "@nomcci/cvmaker-application";
import type { CvData, CvLanguage } from "@nomcci/cvmaker-domain";

import { hasSuspiciousExperienceDistribution, normalizeCv, parseCvJson } from "./normalize";
import { importPrompt, modifyPrompt, repairPrompt, rewritePrompt, translatePrompt } from "./prompts";

export interface PortableCvAiServiceOptions {
  repairSuspiciousExperience?: boolean;
}

export class PortableCvAiService implements CvAiService {
  private readonly repairSuspiciousExperience: boolean;

  constructor(
    private readonly model: ChatModel,
    options: PortableCvAiServiceOptions = {},
  ) {
    this.repairSuspiciousExperience = options.repairSuspiciousExperience ?? true;
  }

  async import(description: string, language: CvLanguage): Promise<CvData> {
    const prompt = importPrompt(description, language);
    const cv = normalizeCv(parseCvJson(await this.complete(prompt, true)), description);
    if (!this.repairSuspiciousExperience || !hasSuspiciousExperienceDistribution(cv)) return cv;

    try {
      return normalizeCv(parseCvJson(await this.complete(repairPrompt(description, cv, language), true)), description);
    } catch {
      return cv;
    }
  }

  async rewrite(cv: CvData, targetRole: string, jobDescription: string | undefined, language: CvLanguage): Promise<CvData> {
    return parseCvJson(await this.complete(rewritePrompt(cv, targetRole, jobDescription, language)));
  }

  async modify(cv: CvData, instruction: string, jobDescription: string | undefined, language: CvLanguage): Promise<CvData> {
    return parseCvJson(await this.complete(modifyPrompt(cv, instruction, jobDescription, language)));
  }

  async translate(cv: CvData, language: CvLanguage): Promise<CvData> {
    return parseCvJson(await this.complete(translatePrompt(cv, language)));
  }

  private complete(prompt: string, json = false): Promise<string> {
    return this.model.complete({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      ...(json ? { responseFormat: "json" as const } : {}),
    });
  }
}