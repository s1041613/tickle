import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { useTimer } from '../../src/composables/useTimer'

type TimerApi = ReturnType<typeof useTimer>

function createTimer(): { timer: TimerApi; scope: EffectScope } {
  const scope = effectScope()
  let timer!: TimerApi
  scope.run(() => {
    timer = useTimer()
  })
  return { timer, scope }
}

describe('useTimer', () => {
  let timer: TimerApi
  let scope: EffectScope

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    })
    ;({ timer, scope } = createTimer())
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  it('T5: default duration shows 05:00', () => {
    expect(timer.formatted.value).toBe('05:00')
    expect(timer.totalSec.value).toBe(300)
    expect(timer.remainSec.value).toBe(300)
    expect(timer.status.value).toBe('idle')
  })

  it('T5b: setDuration(30) updates display to 00:30', () => {
    timer.setDuration(30)
    expect(timer.formatted.value).toBe('00:30')
    expect(timer.remainSec.value).toBe(30)
  })

  it('T6: after 1s advance, remainSec decreases by ~1', () => {
    timer.setDuration(30)
    timer.start()
    expect(timer.status.value).toBe('running')

    vi.advanceTimersByTime(1000)
    // Flush a RAF tick so the tick() function recalculates remainSec
    vi.advanceTimersByTime(16)

    expect(timer.remainSec.value).toBeLessThanOrEqual(29)
    expect(timer.remainSec.value).toBeGreaterThan(28.9)
  })

  it('T7: pause freezes remainSec', () => {
    timer.setDuration(30)
    timer.start()
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(16)
    const frozen = timer.remainSec.value

    timer.pause()
    expect(timer.status.value).toBe('paused')

    vi.advanceTimersByTime(5000)
    expect(timer.remainSec.value).toBe(frozen)
  })

  it('T8: resume continues from paused value, not from totalSec', () => {
    timer.setDuration(30)
    timer.start()
    vi.advanceTimersByTime(10_000)
    vi.advanceTimersByTime(16)
    timer.pause()
    const pausedAt = timer.remainSec.value
    expect(pausedAt).toBeLessThan(21)

    // Wait some real time then resume
    vi.advanceTimersByTime(2000)
    timer.start()
    expect(timer.status.value).toBe('running')

    // Right after resume, before any RAF tick, remainSec should be ~pausedAt
    vi.advanceTimersByTime(16)
    expect(timer.remainSec.value).toBeCloseTo(pausedAt, 1)
  })

  it('T9: reset returns to initial state', () => {
    timer.setDuration(30)
    timer.start()
    vi.advanceTimersByTime(5000)
    vi.advanceTimersByTime(16)

    timer.reset()
    expect(timer.remainSec.value).toBe(timer.totalSec.value)
    expect(timer.remainSec.value).toBe(30)
    expect(timer.status.value).toBe('idle')
  })

  it('T9b: reset from paused returns to idle with full duration', () => {
    timer.setDuration(30)
    timer.start()
    vi.advanceTimersByTime(5000)
    vi.advanceTimersByTime(16)
    timer.pause()
    expect(timer.status.value).toBe('paused')
    // Confirm we're actually mid-countdown (not at 30) before reset
    expect(timer.remainSec.value).toBeLessThan(30)

    timer.reset()
    expect(timer.status.value).toBe('idle')
    expect(timer.remainSec.value).toBe(30)
  })

  it('T9c: reset from done returns to idle with full duration', () => {
    timer.setDuration(2)
    timer.start()
    for (let i = 0; i < 200; i++) vi.advanceTimersByTime(16)
    expect(timer.status.value).toBe('done')
    expect(timer.remainSec.value).toBe(0)

    timer.reset()
    expect(timer.status.value).toBe('idle')
    expect(timer.remainSec.value).toBe(2)
  })

  it('T10: crossing zero triggers onDone callbacks once', () => {
    const doneCb = vi.fn()
    timer.onDone(doneCb)
    timer.setDuration(2)
    timer.start()

    // Advance well past 2 seconds with RAF ticks
    for (let i = 0; i < 200; i++) {
      vi.advanceTimersByTime(16)
    }

    expect(timer.status.value).toBe('done')
    expect(timer.remainSec.value).toBe(0)
    expect(doneCb).toHaveBeenCalledTimes(1)
  })

  it('T10b: multiple onDone callbacks all fire', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    timer.onDone(cb1)
    timer.onDone(cb2)
    timer.setDuration(1)
    timer.start()
    for (let i = 0; i < 100; i++) vi.advanceTimersByTime(16)

    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  describe('formatted - cross-hour', () => {
    it('should format 4675s as 1:17:55', () => {
      timer.setDuration(4675)
      expect(timer.formatted.value).toBe('1:17:55')
    })

    it('should format 3600s as 1:00:00', () => {
      timer.setDuration(3600)
      expect(timer.formatted.value).toBe('1:00:00')
    })

    it('should format 3599s as 59:59 (boundary - stays MM:SS below 1 hour)', () => {
      timer.setDuration(3599)
      expect(timer.formatted.value).toBe('59:59')
    })
  })
})
