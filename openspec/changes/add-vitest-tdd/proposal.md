## Why

The Vite + Vue 3 refactor of BigTimer is functionally complete, but during the final round of manual testing zoe surfaced **five distinct state-machine and Vue ref timing bugs** — all of which were hot-fixed without any regression test in place. Without automated tests, the next round of changes will keep re-introducing the same class of bug (state transitions, ref timing, URL parsing edge cases). We need to add Vitest unit coverage now, while the recent bugs are still fresh, and adopt TDD for further work so each new feature ships with its protection net.

## What Changes

- Add **Vitest** as the test runner, configured for jsdom + Vue SFCs
- Add **@vue/test-utils** for forthcoming component tests
- Refactor `src/composables/useUrlSync.ts` to **export** the currently-private `parseWarnings` and `serializeWarnings` helpers so they are testable in isolation
- Add 21 unit tests across four files covering the three pure-logic composables (`useUrlSync`, `useTimer`, `useMilestones`) plus one integration suite
- Add a `pnpm test` script and wire it into the GitHub Actions deploy workflow so deploys block on failing tests

## Capabilities

### New Capabilities
- `unit-testing`: Project-wide unit-testing infrastructure — Vitest configuration, test conventions, and the initial four test files covering the timer state machine, URL parameter sync, and warning-milestone triggering.

### Modified Capabilities
<!-- None — adding tests doesn't change existing behavior, only protects it -->

## Impact

- **New dev dependencies**: `vitest`, `@vitest/ui`, `@vue/test-utils`, `jsdom`
- **Modified files**: `package.json` (scripts + deps), `tsconfig.json` (include tests dir), `src/composables/useUrlSync.ts` (export internal helpers), `.github/workflows/deploy.yml` (run tests before build)
- **New files**: `vitest.config.ts`, `tests/setup.ts`, `tests/composables/{useUrlSync,useTimer,useMilestones,integration}.test.ts`
- **Unchanged**: All Vue components, side-effect-heavy composables (`useAudio`, `useWakeLock`, `useTabTitle`), and `App.vue` — these need E2E and are deferred.
- **No runtime behavior change** — this is a pure test-infrastructure addition.
