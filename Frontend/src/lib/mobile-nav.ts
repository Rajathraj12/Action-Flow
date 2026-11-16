// Helper utilities for mobile navigation drawer
export function openMobileNav() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("actionflow:toggle-mobile-nav", { detail: true }));
  }
}

export function closeMobileNav() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("actionflow:toggle-mobile-nav", { detail: false }));
  }
}
