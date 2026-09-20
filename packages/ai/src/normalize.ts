import { normalizeCvLinks, type CvData } from "@nomcci/cvmaker-domain";

export function parseCvJson(text: string): CvData {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const value = JSON.parse(cleaned) as CvData;
  if (!value.personal_info?.full_name) throw new Error("Invalid CV JSON from model");
  return value;
}

export function normalizeCv(cv: CvData, sourceText: string): CvData {
  const languages = (cv.languages || []).filter((item) => item.name);
  return {
    personal_info: { ...cv.personal_info, links: normalizeCvLinks(cv.personal_info.links) },
    summary: cv.summary || "",
    experience: (cv.experience || []).filter((item) => item.role || item.company),
    education: (cv.education || [])
      .map((item) => ({ ...item, institution: item.institution || String((item as unknown as Record<string, unknown>).school || "") }))
      .filter((item) => item.degree || item.institution),
    skills: (cv.skills || []).filter((item) => item.name || item.items?.length),
    languages: languages.length ? languages : languagesFromText(sourceText),
  };
}

export function hasSuspiciousExperienceDistribution(cv: CvData): boolean {
  const descriptions = (cv.experience || []).map((item) => item.description?.length || 0);
  const total = descriptions.reduce((sum, count) => sum + count, 0);
  if (descriptions.length < 2 || total < 4 || !descriptions.some((count) => count === 0)) return false;
  return Math.max(...descriptions) >= Math.max(4, Math.ceil(total * 0.7));
}

function languagesFromText(text: string): Array<{ name: string }> {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /\b(languages|idiomas)\b/i.test(line));
  if (start === -1) return [];

  const values: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const cleaned = line.replace(/[*_]/g, "").trim();
    if (!cleaned) continue;
    if (/^(personal|profile|experience|education|skills|datos|perfil|experiencia|educacion|habilidades|enlaces)\b/i.test(cleaned)) break;
    values.push(cleaned);
  }

  return values.join(",")
    .split(/[\n,;]+|\sand\s|\sy\s/i)
    .map((item) => item.replace(/^[-\u2022\s]+/, "").trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}
