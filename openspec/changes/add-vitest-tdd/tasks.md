## 1. Tooling

- [x] 1.1 Install dev dependencies: `pnpm add -D vitest @vitest/ui @vue/test-utils jsdom`
- [x] 1.2 Add `test`, `test:ui`, and `test:coverage` scripts to `package.json`
- [x] 1.3 Create `vitest.config.ts` (jsdom environment, globals enabled)
- [x] 1.4 Create `tests/setup.ts` (fake-timer helper, common assertions)
- [x] 1.5 Update `tsconfig.json` to include `tests/**/*.ts`

## 2. Refactor for testability

- [x] 2.1 Add `export` keyword to `parseWarnings` in `src/composables/useUrlSync.ts`
- [x] 2.2 Add `export` keyword to `serializeWarnings` in `src/composables/useUrlSync.ts`
- [x] 2.3 Verify `pnpm build` still passes after refactor

## 3. URL sync tests (T1-T4)

- [x] 3.1 Write `tests/composables/useUrlSync.test.ts`
- [x] 3.2 T1: `parseWarnings` returns correct shape for well-formed input
- [x] 3.3 T2: `parseWarnings` skips invalid items, keeps valid ones
- [x] 3.4 T3: `parseWarnings` returns null on null/empty input
- [x] 3.5 T4: Round-trip `parse(serialize(x))` equals `x`

## 4. Timer core tests (T5-T10)

- [x] 4.1 Write `tests/composables/useTimer.test.ts` with `vi.useFakeTimers()` setup
- [x] 4.2 T5: Default `formatted` shows `"05:00"`
- [x] 4.3 T6: After 1s advance, `remainSec` decreases by ~1
- [x] 4.4 T7: Pause freezes `remainSec`
- [x] 4.5 T8: Resume continues from paused value
- [x] 4.6 T9: Reset returns to initial state (含 T9b: from paused, T9c: from done)
- [x] 4.7 T10: Crossing zero triggers `onDone` callbacks once

## 5. Milestone tests (T11-T17)

- [x] 5.1 Write `tests/composables/useMilestones.test.ts`
- [x] 5.2 T11: Warning fires when `remainSec` crosses threshold
- [x] 5.3 T12: Same warning does not fire twice (deduplication)
- [x] 5.4 T13: Multiple warnings fire in correct order
- [x] 5.5 T14: `status='done'` sets `visualState='done'` and correct label
- [x] 5.6 T15: Done → idle → running clears triggered + visualState (regression for bug #3)
- [x] 5.7 T16: Paused → running preserves triggered (warnings do not re-fire)
- [x] 5.8 T17: Reset clears all milestone state

## 6. Integration tests (T18-T21)

- [x] 6.1 Write `tests/composables/integration.test.ts`
- [x] 6.2 T18: Idle-time `duration` edit updates `remainSec` live
- [x] 6.3 T19: Running-time `duration` edit is ignored
- [x] 6.4 T20: `repeat=true` auto-restarts 1500ms after done
- [x] 6.5 T21: `repeat=false` stays in done

## 7. CI integration

- [x] 7.1 Add `pnpm test` step to `.github/workflows/deploy.yml` before `pnpm build`
- [x] 7.2 Confirm the step is required (workflow fails if tests fail)
- [ ] 7.3 Push to a branch, open PR, verify GitHub Actions runs tests
      (still pending: repo not yet initialized as git / not pushed to GitHub)

## 8. Validation

- [x] 8.1 Run `pnpm test` — 33 tests green (originally planned 21, added 12 boundary cases)
- [ ] 8.2 Run `pnpm test --coverage` — verify `useTimer`, `useMilestones`, `useUrlSync` are ≥ 80% line coverage
      (deferred — coverage tool not yet installed)
- [x] 8.3 Run `pnpm build` — production build still passes
- [x] 8.4 Run `openspec validate add-vitest-tdd` — change is well-formed
