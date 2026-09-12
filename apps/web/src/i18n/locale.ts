import type { Locale } from "../types";

export const LOCALE_STORAGE_KEY = "cvmaker.locale";
const SUPPORTED_LOCALES = new Set<Locale>(["en", "es"]);

export function resolveLocale(pathname: string, storedLocale?: string | null, browserLanguages: readonly string[] = []): Locale {
  const routeLocale = pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (isLocale(routeLocale)) return routeLocale;
  if (isLocale(storedLocale)) return storedLocale;
  return browserLanguages.some((language) => language.toLowerCase().startsWith("es")) ? "es" : "en";
}

export function localizedPath(pathname: string, locale: Locale): string {
  const parts = pathname.split("/").filter(Boolean);
  if (isLocale(parts[0])) parts.shift();
  return `/${locale}${parts.length ? `/${parts.join("/")}` : "/"}`;
}

function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && SUPPORTED_LOCALES.has(value as Locale));
}
