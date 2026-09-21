import type { ChatModel, ChatModelRequest, CvAiPhase, CvAiProgressReporter, CvAiService } from "@nomcci/cvmaker-application";
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

  async import(description: string, language: CvLanguage, onProgress?: CvAiProgressReporter): Promise<CvData> {
    const prompt = importPrompt(description, language);
    const cv = normalizeCv(parseCvJson(await this.complete(prompt, true, onProgress)), description);
    if (!this.repairSuspiciousExperience || !hasSuspiciousExperienceDistribution(cv)) return cv;

    try {
      return normalizeCv(parseCvJson(await this.complete(repairPrompt(description, cv, language), true, onProgress, "repairing")), description);
    } catch {
      return cv;
    }
  }

  async rewrite(cv: CvData, targetRole: string, jobDescription: string | undefined, language: CvLanguage, onProgress?: CvAiProgressReporter): Promise<CvData> {
    return parseCvJson(await this.complete(rewritePrompt(cv, targetRole, jobDescription, language), false, onProgress));
  }

  async modify(cv: CvData, instruction: string, jobDescription: string | undefined, language: CvLanguage, onProgress?: CvAiProgressReporter): Promise<CvData> {
    return parseCvJson(await this.complete(modifyPrompt(cv, instruction, jobDescription, language), false, onProgress));
  }

  async translate(cv: CvData, language: CvLanguage, onProgress?: CvAiProgressReporter): Promise<CvData> {
    return parseCvJson(await this.complete(translatePrompt(cv, language), false, onProgress));
  }

  private async complete(prompt: string, json = false, onProgress?: CvAiProgressReporter, phase: CvAiPhase = "generating"): Promise<string> {
    const request: ChatModelRequest = {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      ...(json ? { responseFormat: "json" as const } : {}),
    };

    if (onProgress && this.model.stream) {
      let text = "";
      let tokens: number | undefined;
      try {
        for await (const chunk of this.model.stream(request)) {
          if (chunk.content) text += chunk.content;
          if (typeof chunk.tokens === "number") tokens = chunk.tokens;
          onProgress({ phase, characters: text.length, ...(tokens === undefined ? {} : { tokens }) });
        }
        onProgress({ phase: "validating", characters: text.length, ...(tokens === undefined ? {} : { tokens }) });
        return text;
      } catch (error) {
        // Providers that reject streaming (e.g. stream with json_object) fall
        // back to a single non-streaming call while nothing was generated yet.
        if (text.length > 0) throw error;
      }
    }

    const text = await this.model.complete(request);
    onProgress?.({ phase, characters: text.length });
    onProgress?.({ phase: "validating", characters: text.length });
    return text;
  }
}