import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "./api/client";
import type { CvmakerApi } from "./api/cvmaker";
import { CvEditor } from "./components/CvEditor";
import { SessionCard } from "./components/SessionCard";
import { TopBar } from "./components/TopBar";
import { NomcciMark } from "./components/ui/NomcciMark";
import { getMessages } from "./i18n/messages";
import { localizedPath, persistLocale, readStoredLocale, resolveLocale } from "./i18n/locale";
import { applyTheme, initialTheme, THEME_STORAGE_KEY, type Theme } from "./theme";
import type { Locale } from "./types";

interface AppProps { api: CvmakerApi }

export function App({ api }: AppProps) {
  const [locale, setLocale] = useState<Locale>(() => resolveLocale(
    window.location.pathname,
    readStoredLocale(),
    navigator.languages,
  ));
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [toolsOpen, setToolsOpen] = useState(false);
  const messages = getMessages(locale);
  const session = useQuery({ queryKey: ["session"], queryFn: api.getSession, retry: false });

  const unauthenticated = session.isError && session.error instanceof ApiError && session.error.status === 401;

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  useEffect(() => {
    if (unauthenticated) window.location.replace("/login");
  }, [unauthenticated]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = messages.documentTitle;
    document.querySelector('meta[name="description"]')?.setAttribute("content", messages.metaDescription);
  }, [locale, messages]);

  useEffect(() => {
    const syncFromUrl = () => {
      setLocale((current) => {
        const next = resolveLocale(window.location.pathname, readStoredLocale(), navigator.languages);
        return next === current ? current : next;
      });
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".topbar");
    if (!bar) return;
    const update = () => document.documentElement.style.setProperty("--topbar-h", `${bar.offsetHeight}px`);
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  if (session.isPending || unauthenticated) return <Splash label={messages.loading} />;

  function changeLocale(nextLocale: Locale) {
    persistLocale(nextLocale);
    window.history.pushState({}, "", localizedPath(window.location.pathname, nextLocale));
    setLocale(nextLocale);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#editor">{messages.skip}</a>
      <TopBar
        locale={locale}
        theme={theme}
        messages={messages}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onChangeLocale={changeLocale}
        onOpenTools={() => setToolsOpen(true)}
        toolsDisabled={!session.data}
      >
        <SessionCard api={api} messages={messages} />
      </TopBar>
      <CvEditor
        api={api}
        locale={locale}
        messages={messages}
        userId={session.data?.user.id}
        userRole={session.data?.currentPage.role}
        toolsOpen={toolsOpen}
        onCloseTools={() => setToolsOpen(false)}
      />
      <footer className="app-footer">
        <span>Nomcci CVMaker</span>
        <span>{messages.footerNote}</span>
      </footer>
    </div>
  );
}

function Splash({ label }: { label: string }) {
  return (
    <div className="app-shell splash" role="status" aria-label={label}>
      <span className="splash-mark" aria-hidden="true"><NomcciMark size={30} /></span>
      <span className="splash-bar" aria-hidden="true" />
      <span className="splash-label">{label}</span>
    </div>
  );
}
