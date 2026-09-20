import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./ui/Icon";
import { lockScroll, unlockScroll } from "./ui/scroll-lock";

export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

export type PreviewMode = "actual" | "fullscreen";

/**
 * Scale for the fixed A4 viewport. "actual" renders the sheet at real size with
 * outer scroll; "fullscreen" fits the sheet inside the available box.
 */
export function previewScaleForBox(width: number, height: number, mode: PreviewMode): number {
  if (mode === "actual") return 1;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  return Math.min(1, width / A4_WIDTH, height / A4_HEIGHT);
}

function useFitScale(containerRef: RefObject<HTMLElement | null>, mode: PreviewMode): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      setScale(1);
      return;
    }
    const measure = (width?: number, height?: number) => {
      const w = typeof width === "number" ? width : node.clientWidth;
      const h = typeof height === "number" ? height : node.clientHeight;
      setScale(previewScaleForBox(w, h, mode));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = entry?.contentRect?.width;
      const height = entry?.contentRect?.height;
      measure(typeof width === "number" ? width : undefined, typeof height === "number" ? height : undefined);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef, mode]);

  return scale;
}

function A4Sheet({ html, title, scale }: { html: string; title: string; scale: number }) {
  return (
    <div
      className="cv-preview-scaler"
      style={{ width: `${A4_WIDTH * scale}px`, height: `${A4_HEIGHT * scale}px` }}
    >
      <iframe
        className="cv-preview-frame"
        title={title}
        sandbox=""
        srcDoc={html}
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  );
}

interface FullscreenPreviewProps {
  html: string;
  title: string;
  label: string;
  exitLabel: string;
  onExit: () => void;
}

function FullscreenPreview({ html, title, label, exitLabel, onExit }: FullscreenPreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const onExitRef = useRef(onExit);
  const headingId = useId();
  const scale = useFitScale(viewportRef, "fullscreen");

  useEffect(() => {
    onExitRef.current = onExit;
  });

  useEffect(() => {
    restoreFocus.current = document.activeElement as HTMLElement | null;
    lockScroll();
    const frame = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onExitRef.current();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);
      unlockScroll();
      restoreFocus.current?.focus?.({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div className="preview-fullscreen" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <header className="preview-fullscreen-head">
        <h2 id={headingId} className="preview-fullscreen-title">{label}</h2>
        <button
          ref={closeRef}
          type="button"
          className="btn btn-secondary preview-fullscreen-close"
          onClick={onExit}
          aria-label={exitLabel}
        >
          <Icon name="close" size={16} />
          <span>{exitLabel}</span>
        </button>
      </header>
      <div className="preview-fullscreen-viewport" ref={viewportRef}>
        <A4Sheet html={html} title={title} scale={scale} />
      </div>
    </div>,
    document.body,
  );
}

interface CvPreviewProps {
  html: string;
  title: string;
  mode: PreviewMode;
  emptyLabel: string;
  fullscreenLabel: string;
  exitFullscreenLabel: string;
  onExitFullscreen: () => void;
}

export function CvPreview({
  html,
  title,
  mode,
  emptyLabel,
  fullscreenLabel,
  exitFullscreenLabel,
  onExitFullscreen,
}: CvPreviewProps) {
  if (!html) {
    return (
      <div className="cv-preview" data-zoom={mode}>
        <p className="empty-preview">{emptyLabel}</p>
      </div>
    );
  }

  if (mode === "fullscreen") {
    return (
      <FullscreenPreview
        html={html}
        title={title}
        label={fullscreenLabel}
        exitLabel={exitFullscreenLabel}
        onExit={onExitFullscreen}
      />
    );
  }

  return (
    <div className="cv-preview" data-zoom={mode}>
      <A4Sheet html={html} title={title} scale={1} />
    </div>
  );
}
