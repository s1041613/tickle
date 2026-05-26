import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for Tickle E2E tests.
 *
 * - Tests live under `tests/e2e/` with the `*.spec.ts` suffix.
 *   Vitest unit tests use `*.test.ts` — the two patterns are disjoint
 *   so `pnpm test` / `pnpm test:e2e` never pick up each other's files.
 * - `webServer` auto-starts `pnpm dev` for end-screen / mobile specs.
 *   Room-sync specs (which also need PartyKit) still need a manual
 *   `pnpm party:dev` running on :1999 — see tests/e2e/room-sync.spec.ts.
 * - Project matrix covers the surfaces we actually ship to:
 *     - chromium-desktop: primary host environment
 *     - webkit-desktop: parity check for desktop Safari users
 *     - mobile-safari (iPhone 14): closest to iOS Safari quirks
 *     - tablet-safari (iPad Pro 11): the README's main viewer device
 *   Room-sync tests are tagged to chromium-only (they assume single-
 *   worker sequencing on the shared PartyKit DO storage).
 */
const PORT = 5173
const BASE_URL = `http://localhost:${PORT}/tickle/`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      slowMo: process.env.PW_SLOW ? Number(process.env.PW_SLOW) : 0,
    },
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'tablet-safari',
      use: { ...devices['iPad Pro 11'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
