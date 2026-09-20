let lockCount = 0;
let savedScrollY = 0;

/**
 * Locks page scrolling while a modal is open. Uses a depth counter so nested
 * sheets do not unlock early, and fixes the body in place so iOS Safari
 * reliably stops scrolling the page behind the modal.
 */
export function lockScroll(): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    document.documentElement.classList.add("scroll-locked");
    document.body.style.top = `-${savedScrollY}px`;
  }
  lockCount += 1;
}

export function unlockScroll(): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;
  document.documentElement.classList.remove("scroll-locked");
  document.body.style.top = "";
  if (savedScrollY !== 0) {
    try {
      window.scrollTo(0, savedScrollY);
    } catch {
      // jsdom does not implement scrollTo; ignore in tests and non-browser hosts.
    }
  }
}

export function isScrollLocked(): boolean {
  return lockCount > 0;
}
