import { defineConfig, devices } from '@playwright/test';

/**
 * **E2E (Playwright) — F0.** End-to-end tests for the SVGEngine reference
 * app (`playground`), driven through a real browser. This is the THIN top
 * of the testing pyramid: the ~2950 Vitest specs remain the fast unit +
 * integration base; these only cover real-browser user journeys (pointer
 * gestures on the canvas, rendering, navigation, keyboard) that headless
 * happy-dom specs cannot exercise.
 *
 * **Server**: `webServer` auto-starts `ng serve playground` on :4200.
 * Calling `ng serve` directly (via `npm run e2e:serve`) skips the
 * `prestart` ML-model assembly (`assemble:ml`) — the Whisper model is only
 * needed by the voice feature, which E2E never triggers.
 */
const PORT = 4200;
const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // One worker locally keeps the shared dev server calm; CI can parallelize.
  workers: isCI ? 2 : 1,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run e2e:serve',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    // Cold `ng serve` of the playground (Material + 9 entry points) can take
    // a while on the first compile.
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
