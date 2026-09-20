import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { lockScroll, unlockScroll } from "./scroll-lock";

export type SheetVariant = "center" | "bottom" | "side";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  variant?: SheetVariant;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  dismissable?: boolean;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function usePresence(open: boolean): { mounted: boolean; visible: boolean } {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    // Match the longest panel transition (transform 340ms) before unmounting.
    const timeout = window.setTimeout(() => setMounted(false), 360);
    return () => window.clearTimeout(timeout);
  }, [open]);

  return { mounted, visible };
}

export function Sheet({ open, onClose, title, description, variant = "center", children, footer, closeLabel, dismissable = true }: SheetProps) {
  const { mounted, visible } = usePresence(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const onCloseRef = useRef(onClose);
  const dismissableRef = useRef(dismissable);
  useEffect(() => {
    onCloseRef.current = onClose;
    dismissableRef.current = dismissable;
  });

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (dismissableRef.current) onCloseRef.current();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((node) => node.offsetParent !== null || node === document.activeElement);
    if (nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    lockScroll();
    restoreFocus.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const autoFocus = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    const frame = requestAnimationFrame(() => autoFocus?.focus({ preventScroll: true }));
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);
      unlockScroll();
      restoreFocus.current?.focus?.({ preventScroll: true });
    };
  }, [visible, handleKeyDown]);

  if (!mounted) return null;

  return createPortal(
    <div className="sheet-portal" data-visible={visible}>
      <div className="sheet-backdrop" onClick={dismissable ? onClose : undefined} aria-hidden="true" />
      <div
        ref={panelRef}
        className="sheet-panel"
        data-variant={variant}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-label={title ? undefined : closeLabel}
        tabIndex={-1}
      >
        <header className="sheet-head">
          <div className="sheet-heading">
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          {dismissable && (
            <button type="button" className="icon-button" onClick={onClose} aria-label={closeLabel}>
              <Icon name="close" />
            </button>
          )}
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
