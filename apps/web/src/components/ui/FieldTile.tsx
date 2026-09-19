import { useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

interface FieldTileProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  hint?: string;
  closeLabel: string;
  doneLabel: string;
}

export function FieldTile({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  multiline = false,
  rows = 4,
  hint,
  closeLabel,
  doneLabel,
}: FieldTileProps) {
  const [open, setOpen] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="field-tile"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="field-tile-text">
          <span className="field-tile-label">{label}</span>
          <span className="field-tile-value" data-empty={value ? undefined : "true"}>
            {value || placeholder || label}
          </span>
        </span>
        <Icon name="pencil" size={16} className="field-tile-icon" />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description={hint}
        variant="center"
        closeLabel={closeLabel}
      >
        <form className="field-editor" onSubmit={submit} noValidate>
          {multiline ? (
            <textarea
              data-autofocus
              aria-label={label}
              value={value}
              rows={rows}
              placeholder={placeholder}
              onChange={(event) => onChange(event.target.value)}
            />
          ) : (
            <input
              data-autofocus
              aria-label={label}
              type={type}
              value={value}
              placeholder={placeholder}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
          <div className="field-editor-actions">
            <button type="submit" className="btn btn-primary">{doneLabel}</button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
