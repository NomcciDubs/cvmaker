import { useEffect, useId, useRef, useState } from "react";
import { CV_LANGUAGE_CATALOG, type CvLanguage, type CvLanguageInfo } from "@nomcci/cvmaker-domain";
import type { Messages } from "../../i18n/messages";
import type { UiLocale } from "../../types";
import { Icon } from "./Icon";

export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function filterLanguages(query: string, locale: UiLocale): CvLanguageInfo[] {
  const needle = normalizeSearch(query);
  if (!needle) return [...CV_LANGUAGE_CATALOG];
  const tokens = needle.split(" ");
  return CV_LANGUAGE_CATALOG.filter((entry) => {
    const haystack = normalizeSearch(
      [entry.code, entry.nameEn, entry.nameEs, entry.nameNative, ...entry.aliases].join(" "),
    );
    return tokens.every((token) => haystack.includes(token));
  });
}

export function languageDisplayName(entry: CvLanguageInfo, locale: UiLocale): string {
  return locale === "es" ? entry.nameEs : entry.nameEn;
}

interface LanguageComboboxProps {
  value: CvLanguage;
  onChange: (value: CvLanguage) => void;
  locale: UiLocale;
  messages: Messages;
  id?: string;
  label?: string;
  hint?: string;
}

export function LanguageCombobox({
  value,
  onChange,
  locale,
  messages,
  id,
  label,
  hint,
}: LanguageComboboxProps) {
  const baseId = useId();
  const inputId = id ?? `${baseId}-input`;
  const labelId = `${baseId}-label`;
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCode, setActiveCode] = useState<CvLanguage | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = filterLanguages(query, locale);
  const activeIndex = results.findIndex((entry) => entry.code === activeCode);
  const selected = CV_LANGUAGE_CATALOG.find((entry) => entry.code === value) ?? CV_LANGUAGE_CATALOG[0]!;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open ]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveCode(null);
    }
  }, [open ]);

  function select(code: CvLanguage) {
    onChange(code);
    setOpen(false);
    inputRef.current?.focus();
  }

  function moveActive(delta: 1 | -1) {
    if (results.length === 0) return;
    const next = activeIndex < 0
      ? delta === 1 ? 0 : results.length - 1
      : (activeIndex + delta + results.length) % results.length;
    setActiveCode(results[next]!.code);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveCode(results[0]?.code ?? null);
        } else {
          moveActive(1);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (open) moveActive(-1);
        break;
      case "Home":
        if (open && results.length > 0) {
          event.preventDefault();
          setActiveCode(results[0]!.code);
        }
        break;
      case "End":
        if (open && results.length > 0) {
          event.preventDefault();
          setActiveCode(results[results.length - 1]!.code);
        }
        break;
      case "Enter": {
        const target = activeIndex >= 0 ? results[activeIndex] : results.length === 1 ? results[0] : undefined;
        if (open && target) {
          event.preventDefault();
          select(target.code);
        }
        break;
      }
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      default:
        break;
    }
  }

  return (
    <div className="combobox" ref={rootRef} data-open={open ? "true" : undefined}>
      <span className="field-label" id={labelId}>{label ?? messages.aiTargetLanguageLabel}</span>
      <div className="combobox-field">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && activeCode ? `${listId}-${activeCode}` : undefined}
          aria-labelledby={labelId}
          autoComplete="off"
          spellCheck={false}
          placeholder={`${languageDisplayName(selected, locale)} · ${selected.nameNative}`}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveCode(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="icon-button combobox-toggle"
          aria-label={messages.language}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            setOpen((current) => !current);
            inputRef.current?.focus();
          }}
        >
          <Icon name="chevron-down" size={16} />
        </button>
      </div>
      {open && (
        <ul className="combobox-list" role="listbox" id={listId} aria-labelledby={labelId}>
          {results.map((entry) => {
            const isActive = entry.code === activeCode;
            const isSelected = entry.code === value;
            return (
              <li
                key={entry.code}
                id={`${listId}-${entry.code}`}
                role="option"
                aria-selected={isSelected}
                data-active={isActive ? "true" : undefined}
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(entry.code);
                }}
                onMouseEnter={() => setActiveCode(entry.code)}
              >
                <span className="combobox-option-names">
                  <strong>{languageDisplayName(entry, locale)}</strong>
                  <span>{entry.nameNative}</span>
                </span>
                {isSelected && <Icon name="check" size={15} aria-hidden="true" />}
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="combobox-empty" aria-hidden="true">{messages.languageNoResults}</li>
          )}
        </ul>
      )}
      {hint !== undefined ? <p className="combobox-hint">{hint ?? messages.aiTargetLanguageHint}</p> : null}
    </div>
  );
}
