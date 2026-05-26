import { ref, computed, onBeforeUnmount } from 'vue'

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

export function useTimer() {
  const totalSec = ref(300)
  const remainSec = ref(300)
  const status = ref<TimerStatus>('idle')

  let endAtMs = 0
  let rafId: number | null = null
  const onDoneCallbacks: Array<() => void> = []

  const formatted = computed(() => {
    const s = Math.max(0, Math.ceil(remainSec.value))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    }
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  })

  function tick(): void {
    if (status.value !== 'running') return
    const now = Date.now()
    remainSec.value = (endAtMs - now) / 1000

    if (remainSec.value <= 0) {
      remainSec.value = 0
      status.value = 'done'
      onDoneCallbacks.forEach((cb) => cb())
      return
    }
    rafId = requestAnimationFrame(tick)
  }

  function start(): void {
    if (status.value === 'paused') {
      endAtMs = Date.now() + remainSec.value * 1000
    } else {
      remainSec.value = totalSec.value
      endAtMs = Date.now() + totalSec.value * 1000
    }
    status.value = 'running'
    rafId = requestAnimationFrame(tick)
  }

  /**
   * Begin counting down toward an externally-provided `endAtMs`.
   *
   * Use case: viewer mode. The host computed `endAtMs` against the
   * authoritative server clock and broadcast it; we run the same number
   * locally so all clients converge on the same display.
   *
   * Contract differences from `start()`:
   *   - Does NOT reset `totalSec` — the caller controls that separately
   *     via `setDuration()`.
   *   - Does NOT use `Date.now() + totalSec * 1000` — uses the supplied
   *     `endAtMs` verbatim. Caller has already incorporated any clock
   *     offset.
   *   - Initial `remainSec` is computed immediately from the passed
   *     `endAtMs` so the first paint is correct (no waiting for the
   *     first rAF tick).
   *   - If `endAtMs` is already in the past, transitions straight to
   *     `done` and fires onDone callbacks — keeps the state machine
   *     consistent with `tick()`.
   */
  function startWithEndAt(at: number): void {
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
    endAtMs = at
    const now = Date.now()
    const remaining = (endAtMs - now) / 1000
    if (remaining <= 0) {
      remainSec.value = 0
      status.value = 'done'
      onDoneCallbacks.forEach((cb) => cb())
      return
    }
    remainSec.value = remaining
    status.value = 'running'
    rafId = requestAnimationFrame(tick)
  }

  function pause(): void {
    if (status.value !== 'running') return
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
    status.value = 'paused'
  }

  function reset(): void {
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
    remainSec.value = totalSec.value
    status.value = 'idle'
  }

  function setDuration(sec: number): void {
    totalSec.value = Math.max(1, Math.floor(sec))
    if (status.value !== 'running') {
      remainSec.value = totalSec.value
    }
  }

  function onDone(cb: () => void): void {
    onDoneCallbacks.push(cb)
  }

  onBeforeUnmount(() => {
    if (rafId !== null) cancelAnimationFrame(rafId)
  })

  return {
    totalSec,
    remainSec,
    status,
    formatted,
    start,
    startWithEndAt,
    pause,
    reset,
    setDuration,
    onDone,
  }
}
