import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Messages } from "../i18n/messages";
import type { Locale } from "../types";
import type { Theme } from "../theme";
import { ThemeToggle } from "./ThemeToggle";
import { Icon } from "./ui/Icon";
import { NomcciMark } from "./ui/NomcciMark";
import { Segmented } from "./ui/Segmented";

interface TopBarProps {
  locale: Locale;
  theme: Theme;
  messages: Messages;
  onToggleTheme: () => void;
  onChangeLocale: (locale: Locale) => void;
  onOpenTools: () => void;
  toolsDisabled?: boolean;
  children?: ReactNode;
}

const LOCALE_OPTIONS = [
  { value: "en" as Locale, label: "EN" },
  { value: "es" as Locale, label: "ES" },
];

export function TopBar({
  locale,
  theme,
  messages,
  onToggleTheme,
  onChangeLocale,
  onOpenTools,
  toolsDisabled,
  children,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href={`/${locale}/`} aria-label={messages.brandHome}>
          <span className="brand-mark" aria-hidden="true"><NomcciMark size={20} /></span>
          <span className="brand-name">Nomcci <b>CVMaker</b></span>
        </a>
        <div className="topbar-actions">
          <button
            type="button"
            className="icon-button tools-button"
            onClick={onOpenTools}
            disabled={toolsDisabled}
            aria-label={messages.tools}
            title={messages.tools}
          >
            <Icon name="sliders" size={18} />
          </button>
          <div className="topbar-prefs-inline">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} label={messages.toggleTheme} />
            <Segmented
              options={LOCALE_OPTIONS}
              value={locale}
              onChange={onChangeLocale}
              ariaLabel={messages.language}
              className="lang-switch"
            />
          </div>
          <PreferencesMenu
            locale={locale}
            theme={theme}
            messages={messages}
            onToggleTheme={onToggleTheme}
            onChangeLocale={onChangeLocale}
          />
          {children}
        </div>
      </div>
    </header>
  );
}

interface PreferencesMenuProps {
  locale: Locale;
  theme: Theme;
  messages: Messages;
  onToggleTheme: () => void;
  onChangeLocale: (locale: Locale) => void;
}

function PreferencesMenu({ locale, theme, messages, onToggleTheme, onChangeLocale }: PreferencesMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

  return (
    <div className="topbar-prefs-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="topbar-prefs"
        aria-label={messages.preferences}
        title={messages.preferences}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="menu" size={18} />
      </button>
      {open && (
        <div className="topbar-prefs-popover" id="topbar-prefs" role="group" aria-label={messages.preferences}>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} label={messages.toggleTheme} />
          <Segmented
            options={LOCALE_OPTIONS}
            value={locale}
            onChange={(next) => {
              onChangeLocale(next);
              setOpen(false);
            }}
            ariaLabel={messages.language}
            className="lang-switch"
          />
        </div>
      )}
    </div>
  );
}
