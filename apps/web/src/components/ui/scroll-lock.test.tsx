// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isScrollLocked, lockScroll, unlockScroll } from "./scroll-lock";

afterEach(() => {
  while (isScrollLocked()) unlockScroll();
  document.documentElement.classList.remove("scroll-locked");
  document.body.style.top = "";
});

describe("scroll-lock", () => {
  it("locks and releases the page scroll", () => {
    lockScroll();
    expect(document.documentElement).toHaveClass("scroll-locked");
    expect(isScrollLocked()).toBe(true);

    unlockScroll();
    expect(document.documentElement).not.toHaveClass("scroll-locked");
    expect(document.body.style.top).toBe("");
    expect(isScrollLocked()).toBe(false);
  });

  it("keeps the lock until the last nested owner releases", () => {
    lockScroll();
    lockScroll();
    unlockScroll();
    expect(document.documentElement).toHaveClass("scroll-locked");
    expect(isScrollLocked()).toBe(true);

    unlockScroll();
    expect(document.documentElement).not.toHaveClass("scroll-locked");
    expect(isScrollLocked()).toBe(false);
  });

  it("ignores unlock when nothing is locked", () => {
    unlockScroll();
    expect(isScrollLocked()).toBe(false);
  });
});
