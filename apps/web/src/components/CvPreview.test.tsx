// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { A4_HEIGHT, A4_WIDTH, CvPreview, previewScale } from "./CvPreview";

describe("previewScale", () => {
  it("caps fit mode at 1 and shrinks proportionally", () => {
    expect(previewScale(1600, "fit")).toBe(1);
    expect(previewScale(A4_WIDTH, "fit")).toBe(1);
    expect(previewScale(397, "fit")).toBeCloseTo(0.5, 5);
  });

  it("renders actual mode without scaling", () => {
    expect(previewScale(320, "actual")).toBe(1);
    expect(previewScale(1600, "actual")).toBe(1);
  });

  it("falls back to 1 for invalid widths", () => {
    expect(previewScale(0, "fit")).toBe(1);
    expect(previewScale(Number.NaN, "fit")).toBe(1);
  });
});

function mockResizeObserver(width: number) {
  const observe = vi.fn();
  class MockResizeObserver {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe = () => {
      observe();
      this.callback(
        [{ contentRect: { width } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    };
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  return observe;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CvPreview", () => {
  it("keeps the A4 document sandboxed with a localized title", () => {
    mockResizeObserver(1200);
    render(<CvPreview html="<article>CV</article>" title="CV preview" zoom="fit" emptyLabel="Empty" />);

    const frame = screen.getByTitle("CV preview");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("srcdoc", "<article>CV</article>");
  });

  it("scales the fixed A4 viewport instead of cropping it", () => {
    mockResizeObserver(397);
    const { container } = render(<CvPreview html="<article>CV</article>" title="CV preview" zoom="fit" emptyLabel="Empty" />);

    const scaler = container.querySelector(".cv-preview-scaler") as HTMLElement;
    expect(scaler.style.width).toBe("397px");
    expect(scaler.style.height).toBe(`${A4_HEIGHT * 0.5}px`);
    const frame = screen.getByTitle("CV preview") as HTMLElement;
    expect(frame.style.transform).toBe("scale(0.5)");
  });

  it("renders full size with outer scroll in actual mode", () => {
    mockResizeObserver(397);
    const { container } = render(<CvPreview html="<article>CV</article>" title="CV preview" zoom="actual" emptyLabel="Empty" />);

    const scaler = container.querySelector(".cv-preview-scaler") as HTMLElement;
    expect(scaler.style.width).toBe(`${A4_WIDTH}px`);
    const frame = screen.getByTitle("CV preview") as HTMLElement;
    expect(frame.style.transform).toBe("scale(1)");
  });

  it("shows a localized empty state without an iframe", () => {
    mockResizeObserver(800);
    render(<CvPreview html="" title="CV preview" zoom="fit" emptyLabel="Completa tu nombre" />);

    expect(screen.getByText("Completa tu nombre")).toBeInTheDocument();
    expect(screen.queryByTitle("CV preview")).toBeNull();
  });
});
