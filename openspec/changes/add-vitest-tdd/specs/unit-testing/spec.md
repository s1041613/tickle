## ADDED Requirements

### Requirement: Vitest runner is installed and runnable

The project SHALL include Vitest configured to run TypeScript and Vue Single-File Components in a jsdom environment, exposing a `pnpm test` script.

#### Scenario: Run the test suite from the command line
- **WHEN** a developer runs `pnpm test` in the BigTimer project root
- **THEN** Vitest discovers all `*.test.ts` files under `tests/`
- **AND** each file executes against a jsdom environment with `URLSearchParams`, `window.history`, and `document` available

#### Scenario: Tests can mock time deterministically
- **WHEN** a test calls `vi.useFakeTimers()` and `vi.advanceTimersByTime(1000)`
- **THEN** `Date.now()` returns a value 1000ms later
- **AND** queued `setTimeout` callbacks fire

### Requirement: URL parsing helpers are unit-testable

The `parseWarnings` and `serializeWarnings` helpers in `src/composables/useUrlSync.ts` SHALL be exported so they can be imported directly into test files.

#### Scenario: Parse a well-formed warnings string
- **WHEN** `parseWarnings('60:orange:bell,30:red:gong')` is called
- **THEN** it returns an array of two `Warning` objects with the correct `at`, `color`, and `sound` fields
- **AND** ids are assigned 1 and 2

#### Scenario: Skip invalid items but keep valid ones
- **WHEN** `parseWarnings('60:orange:bell,abc:xyz:wrong')` is called
- **THEN** the result contains only the first (valid) item, not the second

#### Scenario: Handle null and empty input
- **WHEN** `parseWarnings(null)` or `parseWarnings('')` is called
- **THEN** it returns `null` without throwing

#### Scenario: Round-trip stability
- **WHEN** a list of warnings is serialized then parsed back
- **THEN** the result equals the original list (ignoring id reassignment)

### Requirement: Countdown core is unit-testable with mocked time

The `useTimer` composable SHALL allow tests to drive its lifecycle deterministically by mocking `Date.now()` and `requestAnimationFrame`.

#### Scenario: Initial formatted value reflects the duration
- **WHEN** `useTimer()` is created with default `totalSec = 300`
- **THEN** `formatted.value` returns `'05:00'`

#### Scenario: Advancing time causes remainSec to decrease
- **WHEN** `start()` is called and `vi.advanceTimersByTime(1000)` advances by 1 second
- **THEN** `remainSec.value` is approximately 1 less than before

#### Scenario: Pause freezes remainSec
- **WHEN** `pause()` is called during a running countdown
- **THEN** `remainSec.value` does not change on subsequent timer ticks
- **AND** `status.value === 'paused'`

#### Scenario: Resume continues from paused value
- **WHEN** `start()` is called after `pause()`
- **THEN** the countdown continues from the paused `remainSec` (not from `totalSec`)

#### Scenario: Reset returns to initial state
- **WHEN** `reset()` is called from any status
- **THEN** `remainSec.value === totalSec.value`
- **AND** `status.value === 'idle'`

#### Scenario: Done triggers callbacks
- **WHEN** `remainSec` crosses zero
- **THEN** `status.value === 'done'`
- **AND** every callback registered via `onDone()` is invoked exactly once

### Requirement: Milestone detection and state transitions are unit-testable

The `useMilestones` composable SHALL trigger warnings exactly once per crossing and SHALL correctly reset its visual state on idle and on a fresh `running` start.

#### Scenario: Warning fires when remainSec crosses its threshold
- **WHEN** `warnings = [{ at: 20, ... }]` and `remainSec` changes from 21 to 19.5
- **THEN** the `onTrigger` callback is invoked once with that warning
- **AND** `visualState.value` is set to the warning's mapped state

#### Scenario: Same warning does not fire twice
- **WHEN** a warning has fired and `remainSec` continues to decrease past its threshold
- **THEN** `onTrigger` is not invoked again for the same warning id

#### Scenario: Multiple warnings fire in order
- **WHEN** two warnings exist at `at: 20` and `at: 10`
- **THEN** the first fires when `remainSec` crosses 20, the second when it crosses 10

#### Scenario: Done state sets correct visual
- **WHEN** `status` transitions to `'done'`
- **THEN** `visualState.value === 'done'`
- **AND** `activeLabel.value === '⏰ 時間到'`

#### Scenario: Restart from done clears warning state (regression for bug #3)
- **WHEN** `status` transitions from `'done'` to `'idle'` to `'running'`
- **THEN** `triggered` is empty
- **AND** `visualState.value === 'default'`

#### Scenario: Resume from paused preserves warning state (regression for bug #3 inverse)
- **WHEN** `status` transitions from `'running'` to `'paused'` to `'running'`
- **THEN** `triggered` retains the warnings that already fired (they do not fire again)

#### Scenario: Reset clears milestone state
- **WHEN** `status` transitions to `'idle'` from any running state
- **THEN** `triggered` is empty and `visualState.value === 'default'`

### Requirement: Composables work together correctly when composed

When `useTimer` and `useMilestones` are wired together as `App.vue` does, the combined behavior SHALL produce no state inconsistencies across the full countdown lifecycle.

#### Scenario: Live duration edit while idle updates remainSec
- **WHEN** `duration.value` is changed while `status === 'idle'`
- **THEN** `timer.remainSec.value` reflects the new duration immediately

#### Scenario: Live duration edit while running is ignored
- **WHEN** `duration.value` is changed while `status === 'running'`
- **THEN** `timer.remainSec.value` continues counting from its current value, not the new duration

#### Scenario: repeat=true auto-restarts after done
- **WHEN** `repeat.value === true` and `status` transitions to `'done'`
- **THEN** after 1500ms `start()` is called again
- **AND** `status` returns to `'running'`

#### Scenario: repeat=false stays in done
- **WHEN** `repeat.value === false` and `status` transitions to `'done'`
- **THEN** `status` remains `'done'` indefinitely

### Requirement: Test failures block CI deployment

The GitHub Actions deploy workflow SHALL run `pnpm test` before `pnpm build`, and SHALL not deploy if any test fails.

#### Scenario: Failing test prevents deploy
- **WHEN** a push to `main` includes a change that causes any test to fail
- **THEN** the `Deploy` workflow step running tests exits non-zero
- **AND** the deploy step is skipped
