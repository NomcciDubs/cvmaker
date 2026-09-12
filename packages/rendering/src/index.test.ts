import { describe, expect, it } from "vitest";

import type { CvData, CvStyle, CvTemplate, Language } from "@nomcci/cvmaker-domain";

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

const combinations: Array<[CvStyle, CvTemplate, Language]> = [
  ["modern", "cv_base", "en"],
  ["minimal", "cv_base", "es"],
  ["classic", "cv_base", "en"],
  ["executive", "cv_base", "es"],
  ["sidebar_compact", "cv_sidebar", "en"],
  ["sidebar_green", "cv_sidebar", "es"],
];

describe("portable renderer", () => {
  it.each(combinations)("renders the %s style as a complete escaped document", (style, template, language) => {
    const options = { style, template, language };
    const html = renderCvHtml(cv, options);
    expect(html).toContain(`<!doctype html><html lang="${language}">`);
    expect(html).toContain("Grace Hopper");
    expect(html).toContain("Compiler pioneer");
    expect(html).toContain(template === "cv_sidebar" ? 'class="content-grid"' : 'class="columns"');
  });
});
