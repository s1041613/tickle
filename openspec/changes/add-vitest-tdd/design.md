## Context

BigTimer's logic is split between Vue components (presentation), composables (state + behavior), and the Web Audio / Wake Lock APIs (side effects). The recent bug cluster all originated in **composables** — specifically in state transitions (`useMilestones`) and ref timing (`App.vue` watch missing). Components and side-effect-only composables were not implicated. The test suite should target where the bugs are.

The project already uses Vite — Vitest piggy-backs on the same `vite.config.ts` for transforms, TypeScript resolution, and module aliases, so configuration cost is near-zero.

## Goals / Non-Goals

**Goals:**
- Cover the three pure-logic composables (`useUrlSync`, `useTimer`, `useMilestones`) at ≥ 80% line coverage
- Reproduce all five recent hot-fixed bugs as regression tests (revert fix → test fails; reapply → passes)
- Make `pnpm test` a deploy gate in CI
- Keep test runtime under 5 seconds so the TDD red-green cycle stays tight

**Non-Goals:**
- E2E / visual regression testing (deferred to a separate change with Playwright)
- Coverage for `useAudio` (Web Audio synthesis), `useWakeLock` (browser-only API), `useTabTitle` (DOM side effect) — these need real-browser tests
- Component-level mount tests for the six Vue SFCs — also deferred to E2E

## Decisions

### Test runner: Vitest (not Jest)
- Vite-native — shares `vite.config.ts`, no separate transform pipeline
- Faster cold start, parallel by default
- Compatible Jest-like API (`describe` / `it` / `expect`) so the muscle memory transfers
- *Alternative considered:* Jest — rejected because of duplicate config burden (separate `babel.config`, `ts-jest` setup, no Vue SFC support out of the box)

### Test environment: jsdom (not happy-dom or node)
- We need `URLSearchParams`, `window.history`, `window.location` for `useUrlSync` tests
- jsdom is the most spec-complete and stable option
- *Alternative considered:* happy-dom — faster but has occasional spec gaps; not worth the risk for a 21-test suite

### Time mocking: `vi.useFakeTimers()` (not manual stubs)
- `useTimer` depends on `Date.now()` + `requestAnimationFrame`. Vitest's built-in fake timers handle both
- Tests can advance time deterministically with `vi.advanceTimersByTime()`
- *Alternative considered:* sinon — extra dep, no benefit over built-in

### Test file layout: mirror source structure under `tests/`
```
tests/
├── setup.ts                              # global fake-timer helpers
└── composables/
    ├── useUrlSync.test.ts
    ├── useTimer.test.ts
    ├── useMilestones.test.ts
    └── integration.test.ts               # multiple composables wired together
```
- *Alternative considered:* `__tests__` co-located next to source — rejected because tests/ at root is easier to exclude from `tsc --noEmit` for production builds

### Refactor: export `parseWarnings` / `serializeWarnings` from `useUrlSync.ts`
- Currently they are module-private; we need them callable from tests
- Minimal change — just add `export` keyword to each. The composable `useUrlSync()` itself doesn't need to change

### TDD workflow for regression tests
- For each of the five recent bugs, write a failing test that captures the symptom **before** confirming the fix is reapplied
- This ensures the test actually catches the regression, not just passes coincidentally

## Risks / Trade-offs

- **[Risk]** `requestAnimationFrame` interactions with `vi.useFakeTimers()` can be finicky — RAF callbacks may not flush as expected → **Mitigation:** Use `vi.runAllTimers()` after advancing time, or refactor `useTimer` to optionally use `setTimeout` in test mode (last resort)
- **[Risk]** Vue's reactivity uses microtasks — assertions before `await nextTick()` will see stale values → **Mitigation:** Wrap async assertions in `await nextTick()` consistently; document this in `tests/setup.ts`
- **[Trade-off]** No component tests means style-related bugs (the Tailwind class conflict that hid the button text) won't be caught by this suite → **Mitigation:** Accepted — that class of bug is what E2E with screenshot diffing is for; covered in a separate future change
- **[Trade-off]** Coverage threshold set at 80%, not 100% — `useTimer`'s `onBeforeUnmount` hook is lifecycle-bound and hard to test without mounting a real component → **Mitigation:** Document the excluded lines, revisit if a related bug surfaces
