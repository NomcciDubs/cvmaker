import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CvmakerApi } from "./api/cvmaker";
import { CvEditor } from "./components/CvEditor";
import { SessionCard } from "./components/SessionCard";
import { getMessages } from "./i18n/messages";
import { localizedPath, LOCALE_STORAGE_KEY, resolveLocale } from "./i18n/locale";
import type { Locale } from "./types";

interface AppProps { api: CvmakerApi }

export function App({ api }: AppProps) {
  const [locale, setLocale] = useState<Locale>(() => resolveLocale(
    window.location.pathname,
    window.localStorage.getItem(LOCALE_STORAGE_KEY),
    navigator.languages,
  ));
  const messages = getMessages(locale);
  const session = useQuery({ queryKey: ["session"], queryFn: api.getSession, retry: false });

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function changeLocale(nextLocale: Locale) {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    window.history.pushState({}, "", localizedPath(window.location.pathname, nextLocale));
    setLocale(nextLocale);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#editor">{messages.skip}</a>
      <header className="topbar">
        <a className="brand" href={`/${locale}/`} aria-label="Nomcci CVMaker home">
          <span className="brand-mark">N</span><span>Nomcci <b>CVMaker</b></span>
        </a>
        <div className="language-switcher" aria-label={messages.language}>
          <button type="button" className={locale === "en" ? "active" : ""} onClick={() => changeLocale("en")}>EN</button>
          <button type="button" className={locale === "es" ? "active" : ""} onClick={() => changeLocale("es")}>ES</button>
        </div>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{messages.eyebrow}</p>
          <h1>{messages.title}</h1>
          <p>{messages.intro}</p>
        </div>
        <SessionCard api={api} messages={messages} />
      </section>
      <CvEditor api={api} locale={locale} messages={messages} userId={session.data?.user.id} userRole={session.data?.currentPage.role} />
      <footer><span>Nomcci CVMaker</span><span>Incremental frontend foundation · 2026</span></footer>
    </div>
  );
}
