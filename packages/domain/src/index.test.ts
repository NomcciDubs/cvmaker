import { describe, expect, it } from "vitest";

import { DEFAULT_PDF_QUOTA_SETTINGS, aiDailyLimitFor, pdfDailyLimitFor } from "./index";

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