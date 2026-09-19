import { useEffect, useRef, useState } from "react";

export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

export type PreviewZoom = "fit" | "actual";

/**
 * Scale for the fixed A4 viewport. "fit" shrinks the sheet to the available
 * width without ever enlarging it; "actual" renders at 100% with outer scroll.
 */
export function previewScale(availableWidth: number, zoom: PreviewZoom): number {
  if (zoom === "actual") return 1;
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  return Math.min(1, availableWidth / A4_WIDTH);
}

interface CvPreviewProps {
  html: string;
  title: string;
  zoom: PreviewZoom;
  emptyLabel: string;
}

export function CvPreview({ html, title, zoom, emptyLabel }: CvPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      setScale(previewScale(node?.clientWidth ?? 0, zoom));
      return;
    }
    const update = (width?: number) => setScale(previewScale(width ?? node.clientWidth, zoom));
    update();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = entry?.contentRect?.width;
      update(typeof width === "number" ? width : undefined);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [zoom]);

  if (!html) {
    return (
      <div className="cv-preview" data-zoom={zoom}>
        <p className="empty-preview">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="cv-preview" ref={containerRef} data-zoom={zoom}>
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
    </div>
  );
}
