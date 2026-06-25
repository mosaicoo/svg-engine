import { test as base, expect } from '@playwright/test';

/**
 * **E2E base fixture (F0).** Every test gets a `page` that:
 *
 * 1. **Clears `localStorage` / `sessionStorage`** before the app boots, so
 *    persisted state (auto-save D-073, recent files, keybindings D-086,
 *    recent swatches) never leaks between tests.
 * 2. **Disables CSS transitions/animations** as early as possible — Material
 *    dialog/menu animations are a classic source of E2E flakiness. Done via
 *    an init script (zero app-code change), applied on every navigation.
 *
 * Both are registered with `addInitScript`, which runs in the page context
 * BEFORE any app script on each navigation — so the cleared storage and the
 * style are in place before Angular bootstraps.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* storage may be unavailable on the initial blank page — ignore */
      }
      const css =
        '*,*::before,*::after{transition:none!important;animation:none!important;' +
        'scroll-behavior:auto!important}';
      const inject = (): void => {
        const style = document.createElement('style');
        style.setAttribute('data-e2e', 'no-animations');
        style.textContent = css;
        document.head.appendChild(style);
      };
      if (document.head) inject();
      else document.addEventListener('DOMContentLoaded', inject, { once: true });
    });
    await use(page);
  },
});

export { expect };
