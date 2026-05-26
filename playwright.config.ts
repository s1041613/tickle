import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for Tickle room-sync E2E tests (QA-4).
 *
 * - Tests live under `tests/e2e/` and use the `*.spec.ts` suffix.
 *   Vitest unit tests use `*.test.ts` (see vitest.config.ts) — the
 *   two patterns are disjoint so `pnpm test` / `pnpm test:e2e` never
 *   pick up each other's files.
 * - We do NOT manage the dev servers from here. The CI script (or the
 *   developer running locally) needs both `pnpm party:dev` AND `pnpm dev`
 *   running before `pnpm test:e2e`. Spawning them inside Playwright's
 *   `webServer` block conflicts with the worktree's shared running dev
 *   servers and makes failure modes more confusing.
 * - Single-worker, single-browser: room-sync tests touch the same
 *   PartyKit DO storage; parallel workers would race on room ids.
 *   chromium-only matches what we ship-to-customer (other browsers
 *   are validated manually).
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  // Each test opens 2+ browser contexts and exercises a WebSocket round
  // trip; default 30s is plenty but some scenarios (visibility re-sync,
  // long countdowns) need extra headroom.
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173/tickle/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Force a desktop-shaped viewport. Some elements (kicked ribbon,
    // viewer badge) have responsive breakpoints; tests pin a width to
    // avoid mobile-layout surprises masking real bugs.
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
