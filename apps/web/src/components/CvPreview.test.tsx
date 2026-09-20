// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { A4_HEIGHT, A4_WIDTH, CvPreview, previewScaleForBox } from "./CvPreview";

describe("previewScaleForBox", () => {
  it("renders actual mode without scaling", () => {
    expect(previewScaleForBox(320, 400, "actual")).toBe(1);
    expect(previewScaleForBox(1600, 2000, "actual")).toBe(1);
  });

  it("fits fullscreen mode to both width and height", () => {
    expect(previewScaleForBox(A4_WIDTH, A4_HEIGHT, "fullscreen")).toBe(1);
    expect(previewScaleForBox(A4_WIDTH / 2, A4_HEIGHT, "fullscreen")).toBeCloseTo(0.5, 5);
    expect(previewScaleForBox(A4_WIDTH, A4_HEIGHT / 2, "fullscreen")).toBeCloseTo(0.5, 5);
  });

  it("falls back to 1 for invalid measurements", () => {
    expect(previewScaleForBox(0, 0, "fullscreen")).toBe(1);
    expect(previewScaleForBox(Number.NaN, 400, "fullscreen")).toBe(1);
  });
});

function mockResizeObserver(width: number, height: number) {
  class MockResizeObserver {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe = () => {
      this.callback(
        [{ contentRect: { width, height } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    };
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CvPreview", () => {
  it("keeps the A4 document sandboxed at real size in 100% mode", () => {
    render(
      <CvPreview
        html="<article>CV</article>"
        title="CV preview"
        mode="actual"
        emptyLabel="Empty"
        fullscreenLabel="Full screen"
        exitFullscreenLabel="Exit"
        onExitFullscreen={() => {}}
      />,
    );

    const frame = screen.getByTitle("CV preview");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("srcdoc", "<article>CV</article>");
    expect(frame.style.transform).toBe("scale(1)");
    const scaler = frame.closest(".cv-preview-scaler") as HTMLElement;
    expect(scaler.style.width).toBe(`${A4_WIDTH}px`);
    expect(scaler.style.height).toBe(`${A4_HEIGHT}px`);
  });

  it("opens a fullscreen dialog that fits the viewport and can be closed", async () => {
    mockResizeObserver(A4_WIDTH / 2, A4_HEIGHT / 2);
    const onExit = vi.fn();
    const user = userEvent.setup();
    render(
      <CvPreview
        html="<article>CV</article>"
        title="CV preview"
        mode="fullscreen"
        emptyLabel="Empty"
        fullscreenLabel="Full-screen CV preview"
        exitFullscreenLabel="Exit full screen"
        onExitFullscreen={onExit}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Full-screen CV preview" });
    expect(dialog).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("scroll-locked");

    const frame = screen.getByTitle("CV preview");
    await waitFor(() => expect(frame.style.transform).toBe("scale(0.5)"));

    await user.click(screen.getByRole("button", { name: "Exit full screen" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("closes the fullscreen dialog with Escape", async () => {
    mockResizeObserver(A4_WIDTH, A4_HEIGHT);
    const onExit = vi.fn();
    const user = userEvent.setup();
    render(
      <CvPreview
        html="<article>CV</article>"
        title="CV preview"
        mode="fullscreen"
        emptyLabel="Empty"
        fullscreenLabel="Full-screen CV preview"
        exitFullscreenLabel="Exit full screen"
        onExitFullscreen={onExit}
      />,
    );

    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("shows a localized empty state without an iframe", () => {
    render(
      <CvPreview
        html=""
        title="CV preview"
        mode="actual"
        emptyLabel="Completa tu nombre"
        fullscreenLabel="Full screen"
        exitFullscreenLabel="Exit"
        onExitFullscreen={() => {}}
      />,
    );

    expect(screen.getByText("Completa tu nombre")).toBeInTheDocument();
    expect(screen.queryByTitle("CV preview")).toBeNull();
  });
});
