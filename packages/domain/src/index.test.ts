import { describe, expect, it } from "vitest";

import {
  CV_LANGUAGES,
  CV_LANGUAGE_CATALOG,
  DEFAULT_PDF_QUOTA_SETTINGS,
  aiDailyLimitFor,
  cvLanguageInfo,
  isCvLanguage,
  pdfDailyLimitFor,
  resolveCvLanguage,
} from "./index";

describe("role quotas", () => {
  it("maps AI daily limits by role", () => {
    expect(aiDailyLimitFor("SUPER_ADMIN")).toBeNull();
    expect(aiDailyLimitFor("FRIEND")).toBe(10);
    expect(aiDailyLimitFor("USER")).toBe(1);
  });

  it("maps PDF daily limits from quota settings", () => {
    expect(pdfDailyLimitFor("SUPER_ADMIN", DEFAULT_PDF_QUOTA_SETTINGS)).toBeNull();
    expect(pdfDailyLimitFor("FRIEND", DEFAULT_PDF_QUOTA_SETTINGS)).toBe(20);
    expect(pdfDailyLimitFor("USER", DEFAULT_PDF_QUOTA_SETTINGS)).toBe(3);

    const custom = { ...DEFAULT_PDF_QUOTA_SETTINGS, defaultDaily: 7, friendDaily: 9, superAdminDaily: 11 };
    expect(pdfDailyLimitFor("SUPER_ADMIN", custom)).toBe(11);
    expect(pdfDailyLimitFor("FRIEND", custom)).toBe(9);
    expect(pdfDailyLimitFor("USER", custom)).toBe(7);
  });

  it("covers the 12 LTR document languages with unique codes and names", () => {
    expect(CV_LANGUAGES).toEqual(["en", "es", "pt", "fr", "de", "it", "nl", "pl", "tr", "id", "vi", "ro"]);
    expect(CV_LANGUAGE_CATALOG).toHaveLength(12);
    expect(new Set(CV_LANGUAGE_CATALOG.map((entry) => entry.code)).size).toBe(12);
    for (const entry of CV_LANGUAGE_CATALOG) {
      expect(entry.direction).toBe("ltr");
      expect(entry.bcp47).toBe(entry.code);
      expect(entry.nameEn.trim()).not.toBe("");
      expect(entry.nameEs.trim()).not.toBe("");
      expect(entry.nameNative.trim()).not.toBe("");
      expect(entry.aliases.length).toBeGreaterThan(0);
    }
  });

  it("validates and resolves document languages with an English fallback", () => {
    expect(isCvLanguage("pt")).toBe(true);
    expect(isCvLanguage("xx")).toBe(false);
    expect(isCvLanguage(null)).toBe(false);
    expect(resolveCvLanguage("ro")).toBe("ro");
    expect(resolveCvLanguage("xx")).toBe("en");
    expect(cvLanguageInfo("de").nameEn).toBe("German");
    expect(cvLanguageInfo("nl").nameNative).toBe("Nederlands");
  });

  it("matches the legacy default quota seed", () => {
    expect(DEFAULT_PDF_QUOTA_SETTINGS).toEqual({
      defaultDaily: 3,
      friendDaily: 20,
      superAdminDaily: null,
      maxArchivedPdfs: 20,
      maxArchivedPdfBytes: 26_214_400,
    });
  });
});