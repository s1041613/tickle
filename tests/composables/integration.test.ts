import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { effectScope, nextTick, ref, watch, type EffectScope } from 'vue'
import { useTimer } from '../../src/composables/useTimer'

describe('useTimer + duration watcher (App.vue integration)', () => {
  let scope: EffectScope

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    })
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  it('T18: idle duration edit updates remainSec immediately', async () => {
    let timer!: ReturnType<typeof useTimer>
    const duration = ref(300)

    scope.run(() => {
      timer = useTimer()
      timer.setDuration(duration.value)
      watch(duration, (v) => {
        if (timer.status.value === 'idle' || timer.status.value === 'done') {
          timer.setDuration(v)
        }
      })
    })

    expect(timer.remainSec.value).toBe(300)

    duration.value = 30
    await nextTick()

    expect(timer.remainSec.value).toBe(30)
    expect(timer.formatted.value).toBe('00:30')
  })

  it('T19: running duration edit does NOT change remainSec', async () => {
    let timer!: ReturnType<typeof useTimer>
    const duration = ref(30)

    scope.run(() => {
      timer = useTimer()
      timer.setDuration(duration.value)
      watch(duration, (v) => {
        if (timer.status.value === 'idle' || timer.status.value === 'done') {
          timer.setDuration(v)
        }
      })
    })

    timer.start()
    vi.advanceTimersByTime(2000)
    vi.advanceTimersByTime(16)
    const runningRemain = timer.remainSec.value
    expect(runningRemain).toBeLessThan(29)
    expect(runningRemain).toBeGreaterThan(27)

    // Now change duration while running — should NOT affect current countdown
    duration.value = 600
    await nextTick()
    expect(timer.remainSec.value).toBeCloseTo(runningRemain, 1)
    expect(timer.status.value).toBe('running')
  })
})

describe('repeat behavior (timer.onDone integration)', () => {
  let scope: EffectScope

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    })
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  it('T20: repeat=true triggers auto-restart 1500ms after done', async () => {
    let timer!: ReturnType<typeof useTimer>
    const repeat = ref(true)

    scope.run(() => {
      timer = useTimer()
      timer.setDuration(1)
      timer.onDone(() => {
        if (repeat.value) {
          setTimeout(() => timer.start(), 1500)
        }
      })
    })

    timer.start()
    // Run past the 1-second countdown
    for (let i = 0; i < 100; i++) vi.advanceTimersByTime(16)

    expect(timer.status.value).toBe('done')

    // 1500ms later, auto-restart fires
    vi.advanceTimersByTime(1500)
    expect(timer.status.value).toBe('running')
  })

  it('T21: repeat=false stays in done indefinitely', async () => {
    let timer!: ReturnType<typeof useTimer>
    const repeat = ref(false)
    const restartSpy = vi.fn()

    scope.run(() => {
      timer = useTimer()
      timer.setDuration(1)
      timer.onDone(() => {
        if (repeat.value) {
          restartSpy()
          setTimeout(() => timer.start(), 1500)
        }
      })
    })

    timer.start()
    for (let i = 0; i < 100; i++) vi.advanceTimersByTime(16)
    expect(timer.status.value).toBe('done')

    // Plenty of time later, should still be done
    vi.advanceTimersByTime(10_000)
    expect(timer.status.value).toBe('done')
    expect(restartSpy).not.toHaveBeenCalled()
  })
})
