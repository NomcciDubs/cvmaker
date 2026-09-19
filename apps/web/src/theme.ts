export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "cvmaker.theme";

const THEME_COLORS: Record<Theme, string> = {
  light: "#e9e8e4",
  dark: "#0d1117",
};

export function resolveTheme(stored?: string | null, prefersDark = false): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}

export function initialTheme(): Theme {
  const inline = document.documentElement.dataset.theme;
  if (inline === "light" || inline === "dark") return inline;
  const prefersDark = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    stored = null;
  }
  return resolveTheme(stored, prefersDark);
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}
