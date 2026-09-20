import { describe, expect, it } from "vitest";

import {
  cvInputRequestSchema,
  importImproveRequestSchema,
  languageSchema,
  linkSchema,
  pdfArchiveFilenameSchema,
  pdfQuotaSettingsSchema,
  pdfRequestSchema,
  photoRequestSchema,
  renderCvRequestSchema,
} from "./index";

const cv = { personal_info: { full_name: "Ada Lovelace" } };
const renderOptions = { style: "modern", template: "cv_base", language: "en" };

describe("portable HTTP contracts", () => {
  it("normalizes CV input defaults and accepts an optional UUID", () => {
    expect(cvInputRequestSchema.parse({ content: "  Resume text  " })).toEqual({
      name: "Imported CV",
      content: "Resume text",
    });
    expect(cvInputRequestSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      name: "  Source  ",
      content: "text",
    }).name).toBe("Source");
  });

  it("bounds CV input names and content", () => {
    expect(cvInputRequestSchema.safeParse({ name: "x".repeat(121), content: "text" }).success).toBe(false);
    expect(cvInputRequestSchema.safeParse({ content: "x".repeat(200_001) }).success).toBe(false);
    expect(cvInputRequestSchema.safeParse({ content: "   " }).success).toBe(false);
    expect(cvInputRequestSchema.safeParse({ id: "not-a-uuid", content: "text" }).success).toBe(false);
  });

  it.each(["png", "jpg", "jpeg", "webp"])("accepts %s photo data URLs", (format) => {
    expect(photoRequestSchema.parse({ dataUrl: `data:image/${format};base64,YWJjZA==` })).toEqual({
      name: "CV photo",
      dataUrl: `data:image/${format};base64,YWJjZA==`,
    });
  });

  it("rejects unsupported, malformed, and oversized photos", () => {
    expect(photoRequestSchema.safeParse({ dataUrl: "data:image/svg+xml;base64,YWJjZA==" }).success).toBe(false);
    expect(photoRequestSchema.safeParse({ dataUrl: "data:image/png;base64,not valid" }).success).toBe(false);
    expect(photoRequestSchema.safeParse({ dataUrl: `data:image/png;base64,${"A".repeat(900_000)}` }).success).toBe(false);
    expect(photoRequestSchema.safeParse({ name: "x".repeat(121), dataUrl: "data:image/png;base64,YQ==" }).success).toBe(false);
  });

  it("requires an import workflow and either a target role or instruction", () => {
    const base = {
      cv,
      originalCv: cv,
      importWorkflowId: "00000000-0000-4000-8000-000000000001",
      language: "en",
    };
    expect(importImproveRequestSchema.safeParse(base).success).toBe(false);
    expect(importImproveRequestSchema.safeParse({ ...base, targetRole: "Engineer" }).success).toBe(true);
    expect(importImproveRequestSchema.safeParse({ ...base, instruction: "Improve the summary" }).success).toBe(true);
    expect(importImproveRequestSchema.safeParse({ ...base, importWorkflowId: "invalid", targetRole: "Engineer" }).success).toBe(false);
  });

  it("coerces bare link strings instead of rejecting the whole CV", () => {
    expect(linkSchema.parse({ label: "Portfolio", url: "https://example.com" })).toEqual({
      label: "Portfolio",
      url: "https://example.com",
    });
    expect(linkSchema.parse("https://example.com/a")).toEqual({
      label: "https://example.com/a",
      url: "https://example.com/a",
    });
    expect(linkSchema.safeParse("").success).toBe(false);
    expect(
      renderCvRequestSchema.safeParse({
        cv: { personal_info: { full_name: "Ada", links: ["https://example.com/a"] } },
        ...renderOptions,
      }).success,
    ).toBe(true);
  });

  it("accepts the 12 document languages and rejects unknown codes", () => {
    for (const language of ["en", "es", "pt", "fr", "de", "it", "nl", "pl", "tr", "id", "vi", "ro"]) {
      expect(languageSchema.safeParse(language).success).toBe(true);
      expect(renderCvRequestSchema.safeParse({ cv, ...renderOptions, language }).success).toBe(true);
    }
    expect(languageSchema.safeParse("xx").success).toBe(false);
    expect(renderCvRequestSchema.safeParse({ cv, ...renderOptions, language: "xx" }).success).toBe(false);
  });

  it("validates PDF render requests and archive filenames", () => {
    expect(pdfRequestSchema.safeParse({ cv, ...renderOptions, name: "Ada CV" }).success).toBe(true);
    expect(pdfRequestSchema.safeParse({ cv, ...renderOptions, name: "x".repeat(201) }).success).toBe(false);
    expect(pdfArchiveFilenameSchema.safeParse("00000000-0000-4000-8000-000000000000-ada-cv.pdf").success).toBe(true);
    expect(pdfArchiveFilenameSchema.safeParse("../ada.pdf").success).toBe(false);
  });

  it("validates PDF quota settings at legacy administration bounds", () => {
    const valid = {
      defaultDaily: 3,
      friendDaily: 20,
      superAdminDaily: null,
      maxArchivedPdfs: 20,
      maxArchivedPdfBytes: 25 * 1024 * 1024,
    };
    expect(pdfQuotaSettingsSchema.safeParse(valid).success).toBe(true);
    expect(pdfQuotaSettingsSchema.safeParse({ ...valid, superAdminDaily: 100 }).success).toBe(true);

    for (const invalid of [
      { ...valid, defaultDaily: 0 },
      { ...valid, friendDaily: 101 },
      { ...valid, superAdminDaily: 1.5 },
      { ...valid, maxArchivedPdfs: 101 },
      { ...valid, maxArchivedPdfBytes: 250 * 1024 * 1024 + 1 },
    ]) {
      expect(pdfQuotaSettingsSchema.safeParse(invalid).success).toBe(false);
    }
  });
});
