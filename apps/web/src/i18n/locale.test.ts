import { describe, expect, it } from "vitest";
import { localizedPath, resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("prefers an explicit route over stored and browser preferences", () => {
    expect(resolveLocale("/es/editor", "en", ["en-US"])).toBe("es");
  });

  it("uses the local preference before browser language", () => {
    expect(resolveLocale("/editor", "en", ["es-CO"])).toBe("en");
  });

  it("falls back to Spanish browser variants and then English", () => {
    expect(resolveLocale("/", null, ["es-MX", "en"])).toBe("es");
    expect(resolveLocale("/", null, ["fr-FR"])).toBe("en");
  });

  it("replaces an existing locale without losing the route", () => {
    expect(localizedPath("/en/editor", "es")).toBe("/es/editor");
  });
});
