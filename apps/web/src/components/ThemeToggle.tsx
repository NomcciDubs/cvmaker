import type { Theme } from "../theme";
import { Icon } from "./ui/Icon";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
  label: string;
}

export function ThemeToggle({ theme, onToggle, label }: ThemeToggleProps) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={dark}
      title={label}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb">
          <Icon name={dark ? "moon" : "sun"} size={16} />
        </span>
      </span>
    </button>
  );
}
