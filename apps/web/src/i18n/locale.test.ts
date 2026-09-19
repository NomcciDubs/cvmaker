import { describe, expect, it } from "vitest";
import { localizedPath, resolveLocale, resolveLoginLocale } from "./locale";

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

describe("resolveLoginLocale", () => {
  it("prefers an explicit /en/ or /es/ login route above every preference", () => {
    expect(resolveLoginLocale("/es/login", { sharedLocale: "en", storedLocale: "en", browserLanguages: ["en-US"] })).toBe("es");
    expect(resolveLoginLocale("/en/login", { sharedLocale: "es", storedLocale: "es", browserLanguages: ["es-CO"] })).toBe("en");
  });

  it("uses the shared preference before the local one and the browser", () => {
    expect(resolveLoginLocale("/login", { sharedLocale: "es", storedLocale: "en", browserLanguages: ["en-US"] })).toBe("es");
    expect(resolveLoginLocale("/login", { storedLocale: "es", browserLanguages: ["en-US"] })).toBe("es");
  });

  it("falls back to the browser and then English", () => {
    expect(resolveLoginLocale("/login", { browserLanguages: ["es-MX", "en"] })).toBe("es");
    expect(resolveLoginLocale("/login", { browserLanguages: ["fr-FR"] })).toBe("en");
    expect(resolveLoginLocale("/login")).toBe("en");
  });

  it("ignores unsupported stored values", () => {
    expect(resolveLoginLocale("/login", { sharedLocale: "de", storedLocale: "fr", browserLanguages: ["en"] })).toBe("en");
  });
});
