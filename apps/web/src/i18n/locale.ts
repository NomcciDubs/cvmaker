import type { Locale } from "../types";

export const LOCALE_STORAGE_KEY = "cvmaker.locale";
const SUPPORTED_LOCALES = new Set<Locale>(["en", "es"]);

export function resolveLocale(pathname: string, storedLocale?: string | null, browserLanguages: readonly string[] = []): Locale {
  const routeLocale = pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (isLocale(routeLocale)) return routeLocale;
  if (isLocale(storedLocale)) return storedLocale;
  return browserLanguages.some((language) => language.toLowerCase().startsWith("es")) ? "es" : "en";
}

export interface LoginLocaleSources {
  sharedLocale?: string | null;
  storedLocale?: string | null;
  browserLanguages?: readonly string[];
}

/**
 * Canonical login language priority: explicit route, shared preference, local
 * preference, browser languages, then English. The static login page mirrors
 * this order as a small offline fallback.
 */
export function resolveLoginLocale(pathname: string, sources: LoginLocaleSources = {}): Locale {
  const routeLocale = pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (isLocale(routeLocale)) return routeLocale;
  if (isLocale(sources.sharedLocale)) return sources.sharedLocale;
  if (isLocale(sources.storedLocale)) return sources.storedLocale;
  return sources.browserLanguages?.some((language) => language.toLowerCase().startsWith("es")) ? "es" : "en";
}

export function readStoredLocale(): string | null {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* storage unavailable */
  }
}

export function writeSharedLocaleCookie(locale: Locale): void {
  try {
    let cookie = `nomcci_lang=${locale}; path=/; max-age=31536000; samesite=lax`;
    if (/(^|\.)nomcci\.com$/i.test(window.location.hostname)) cookie += "; domain=.nomcci.com";
    document.cookie = cookie;
  } catch {
    /* cookies unavailable */
  }
}

export function persistLocale(locale: Locale): void {
  writeStoredLocale(locale);
  writeSharedLocaleCookie(locale);
}

export function localizedPath(pathname: string, locale: Locale): string {
  const parts = pathname.split("/").filter(Boolean);
  if (isLocale(parts[0])) parts.shift();
  return `/${locale}${parts.length ? `/${parts.join("/")}` : "/"}`;
}

function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && SUPPORTED_LOCALES.has(value as Locale));
}
