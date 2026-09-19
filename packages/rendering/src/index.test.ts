import { describe, expect, it } from "vitest";

import { CV_LANGUAGES, type CvData, type CvLanguage, type CvStyle, type CvTemplate } from "@nomcci/cvmaker-domain";

import { renderCvHtml } from "./index";

const cv: CvData = {
  personal_info: {
    full_name: "Grace Hopper",
    title: "Computer Scientist",
    email: "grace@example.com",
    phone: "+1 555 0100",
    location: "New York",
    photo_url: "data:image/png;base64,abc",
    links: [{ label: "Profile", url: "https://example.com/grace" }],
  },
  summary: "Compiler pioneer",
  experience: [{ role: "Rear Admiral", company: "US Navy", start_date: "1943", end_date: "1986", description: ["Developed compilers"] }],
  education: [{ degree: "PhD", institution: "Yale", details: ["Mathematics"] }],
  skills: [{ name: "Programming", items: ["COBOL"] }],
  languages: [{ name: "English", level: "Native" }],
};

const combinations: Array<[CvStyle, CvTemplate, CvLanguage]> = [
  ["modern", "cv_base", "en"],
  ["minimal", "cv_base", "es"],
  ["classic", "cv_base", "en"],
  ["executive", "cv_base", "es"],
  ["sidebar_compact", "cv_sidebar", "en"],
  ["sidebar_green", "cv_sidebar", "es"],
];

const expectedHeadings: Record<CvLanguage, { profile: string; education: string }> = {
  en: { profile: "Profile", education: "Education" },
  es: { profile: "Perfil", education: "Educación" },
  pt: { profile: "Perfil", education: "Educação" },
  fr: { profile: "Profil", education: "Formation" },
  de: { profile: "Profil", education: "Ausbildung" },
  it: { profile: "Profilo", education: "Formazione" },
  nl: { profile: "Profiel", education: "Opleiding" },
  pl: { profile: "Profil", education: "Wykształcenie" },
  tr: { profile: "Profil", education: "Eğitim" },
  id: { profile: "Profil", education: "Pendidikan" },
  vi: { profile: "Hồ sơ", education: "Học vấn" },
  ro: { profile: "Profil", education: "Educație" },
};

describe("portable renderer", () => {
  it.each(combinations)("renders the %s style as a complete escaped document", (style, template, language) => {
    const options = { style, template, language };
    const html = renderCvHtml(cv, options);
    expect(html).toContain(`<!doctype html><html lang="${language}">`);
    expect(html).toContain("Grace Hopper");
    expect(html).toContain("Compiler pioneer");
    expect(html).toContain(template === "cv_sidebar" ? 'class="content-grid"' : 'class="columns"');
  });

  it("supports the 12-document language catalog", () => {
    expect(CV_LANGUAGES).toHaveLength(12);
  });

  it.each(CV_LANGUAGES)("renders %s headings for base and sidebar templates", (language) => {
    const expected = expectedHeadings[language];
    for (const template of ["cv_base", "cv_sidebar"] as const) {
      const html = renderCvHtml(cv, { style: "modern", template, language });
      expect(html).toContain(`<html lang="${language}">`);
      expect(html).toContain(`<h2>${expected.profile}</h2>`);
      expect(html).toContain(`<h2>${expected.education}</h2>`);
    }
  });

  it("falls back to English headings for unknown languages", () => {
    const html = renderCvHtml(cv, { style: "modern", template: "cv_base", language: "xx" as CvLanguage });
    expect(html).toContain("<h2>Profile</h2>");
    expect(html).toContain("<h2>Education</h2>");
  });

  it("keeps each template print margin instead of zeroing it globally", () => {
    const margins: Record<CvStyle, string> = {
      modern: "18mm",
      minimal: "18mm",
      classic: "18mm",
      executive: "16mm",
      sidebar_compact: "9mm",
      sidebar_green: "9mm",
    };
    for (const [style, margin] of Object.entries(margins) as Array<[CvStyle, string]>) {
      const html = renderCvHtml(cv, { style, template: "cv_base", language: "en" });
      expect(html).toContain(`@page { size: A4; margin: ${margin}; }`);
    }
    const html = renderCvHtml(cv, { style: "modern", template: "cv_base", language: "en" });
    expect(html).not.toContain("@page { size: A4; margin: 0; }");
  });

  it("keeps the A4 structure independent of the preview viewport", () => {
    const html = renderCvHtml(cv, { style: "modern", template: "cv_base", language: "en" });
    expect(html).toContain("width: 210mm");
    expect(html).toContain("min-height: 297mm");
  });

  it("scopes responsive rules to screens so print keeps the A4 layout", () => {
    for (const style of Object.keys({ modern: 1, minimal: 1, classic: 1, executive: 1, sidebar_compact: 1, sidebar_green: 1 }) as CvStyle[]) {
      const html = renderCvHtml(cv, { style, template: "cv_base", language: "en" });
      expect(html).not.toMatch(/@media \(max-width/);
      expect(html).toContain("@media screen and (max-width: 700px)");
    }
  });
});
