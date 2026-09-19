import { useRef, type CSSProperties, type KeyboardEvent } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  tabs?: boolean;
  className?: string;
  id?: string;
  panelId?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  tabs = false,
  className,
  id,
  panelId,
}: SegmentedProps<T>) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const style = {
    "--seg-index": activeIndex,
    "--seg-count": options.length,
  } as CSSProperties;

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = options.length;
    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % count;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + count) % count;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (tabs) onChange(options[nextIndex]!.value);
    itemRefs.current[nextIndex]?.focus();
  }

  return (
    <div
      className={`segmented${className ? ` ${className}` : ""}`}
      style={style}
      role={tabs ? "tablist" : "group"}
      aria-label={ariaLabel}
    >
      <span className="segmented-indicator" aria-hidden="true" />
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            id={id ? `${id}-${option.value}` : undefined}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            type="button"
            role={tabs ? "tab" : "button"}
            aria-selected={tabs ? selected : undefined}
            aria-pressed={tabs ? undefined : selected}
            aria-controls={tabs && panelId ? panelId : undefined}
            tabIndex={tabs ? (selected ? 0 : -1) : undefined}
            className="segmented-item"
            data-active={selected ? "true" : undefined}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => moveFocus(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
