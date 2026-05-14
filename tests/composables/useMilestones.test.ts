import { describe, it, expect, afterEach, vi } from 'vitest'
import { effectScope, nextTick, ref, type Ref, type EffectScope } from 'vue'
import { useMilestones } from '../../src/composables/useMilestones'
import type { TimerStatus } from '../../src/composables/useTimer'
import type { Warning } from '../../src/types'

interface Harness {
  remainSec: Ref<number>
  status: Ref<TimerStatus>
  warnings: Ref<Warning[]>
  onTrigger: ReturnType<typeof vi.fn>
  milestones: ReturnType<typeof useMilestones>
  scope: EffectScope
}

function setup(initialWarnings: Warning[] = [], initialRemain = 30): Harness {
  const remainSec: Ref<number> = ref(initialRemain)
  const status: Ref<TimerStatus> = ref('idle')
  const warnings: Ref<Warning[]> = ref(initialWarnings)
  const onTrigger = vi.fn()

  const scope = effectScope()
  let milestones!: ReturnType<typeof useMilestones>
  scope.run(() => {
    milestones = useMilestones(remainSec, status, warnings, onTrigger)
  })

  return { remainSec, status, warnings, onTrigger, milestones, scope }
}

describe('useMilestones', () => {
  let h: Harness

  afterEach(() => {
    h?.scope.stop()
  })

  it('T11: warning fires when remainSec crosses threshold', async () => {
    h = setup([{ id: 1, at: 20, color: 'yellow', sound: 'chime' }], 21)
    h.status.value = 'running'
    await nextTick()

    h.remainSec.value = 19.5
    await nextTick()

    expect(h.onTrigger).toHaveBeenCalledTimes(1)
    expect(h.onTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, at: 20 }),
    )
    expect(h.milestones.visualState.value).toBe('warn-yellow')
    expect(h.milestones.activeLabel.value).toBe('剩 20 秒')
  })

  it('T12: same warning does not fire twice', async () => {
    h = setup([{ id: 1, at: 20, color: 'yellow', sound: 'chime' }], 21)
    h.status.value = 'running'
    await nextTick()

    h.remainSec.value = 19.5
    await nextTick()
    h.remainSec.value = 18
    await nextTick()
    h.remainSec.value = 15
    await nextTick()

    expect(h.onTrigger).toHaveBeenCalledTimes(1)
  })

  it('T13: multiple warnings fire in order', async () => {
    h = setup(
      [
        { id: 1, at: 20, color: 'yellow', sound: 'chime' },
        { id: 2, at: 10, color: 'red', sound: 'gong' },
      ],
      25,
    )
    h.status.value = 'running'
    await nextTick()

    h.remainSec.value = 19
    await nextTick()
    expect(h.onTrigger).toHaveBeenCalledTimes(1)
    expect(h.milestones.visualState.value).toBe('warn-yellow')

    h.remainSec.value = 9
    await nextTick()
    expect(h.onTrigger).toHaveBeenCalledTimes(2)
    expect(h.milestones.visualState.value).toBe('warn-red')
    expect(h.onTrigger.mock.calls[1][0]).toMatchObject({ id: 2 })
  })

  it('T14: status=done sets visualState=done and final label', async () => {
    h = setup()
    h.status.value = 'running'
    await nextTick()
    h.status.value = 'done'
    await nextTick()

    expect(h.milestones.visualState.value).toBe('done')
    expect(h.milestones.activeLabel.value).toBe('⏰ 時間到')
  })

  it('T15: done → idle → running clears triggered and resets visualState (regression for bug #3)', async () => {
    h = setup([{ id: 1, at: 20, color: 'yellow', sound: 'chime' }], 25)
    h.status.value = 'running'
    await nextTick()
    // Trigger the warning
    h.remainSec.value = 18
    await nextTick()
    expect(h.milestones.triggered.value.has(1)).toBe(true)

    // Go to done
    h.status.value = 'done'
    await nextTick()
    expect(h.milestones.visualState.value).toBe('done')

    // Restart cycle: done → idle → running
    h.status.value = 'idle'
    await nextTick()
    expect(h.milestones.triggered.value.size).toBe(0)
    expect(h.milestones.visualState.value).toBe('default')

    h.remainSec.value = 25
    await nextTick()
    h.status.value = 'running'
    await nextTick()
    expect(h.milestones.triggered.value.size).toBe(0)
    expect(h.milestones.visualState.value).toBe('default')

    // Same warning should fire again now
    h.remainSec.value = 18
    await nextTick()
    expect(h.onTrigger).toHaveBeenCalledTimes(2)
  })

  it('T16: paused → running preserves triggered (warnings do not re-fire)', async () => {
    h = setup([{ id: 1, at: 20, color: 'yellow', sound: 'chime' }], 25)
    h.status.value = 'running'
    await nextTick()
    h.remainSec.value = 18
    await nextTick()
    expect(h.onTrigger).toHaveBeenCalledTimes(1)

    h.status.value = 'paused'
    await nextTick()
    h.status.value = 'running'
    await nextTick()

    expect(h.milestones.triggered.value.has(1)).toBe(true)
    // Continue counting down; triggered warning should not fire again
    h.remainSec.value = 15
    await nextTick()
    expect(h.onTrigger).toHaveBeenCalledTimes(1)
  })

  it('T17: reset (running → idle) clears all milestone state', async () => {
    h = setup([{ id: 1, at: 20, color: 'yellow', sound: 'chime' }], 25)
    h.status.value = 'running'
    await nextTick()
    h.remainSec.value = 18
    await nextTick()

    h.status.value = 'idle'
    await nextTick()
    expect(h.milestones.triggered.value.size).toBe(0)
    expect(h.milestones.visualState.value).toBe('default')
    expect(h.milestones.activeLabel.value).toBe('')
  })

  it('does not trigger warnings while idle even if remainSec changes', async () => {
    h = setup([{ id: 1, at: 20, color: 'yellow', sound: 'chime' }], 25)
    // status stays 'idle'
    h.remainSec.value = 18
    await nextTick()
    expect(h.onTrigger).not.toHaveBeenCalled()
  })

  it('does not fire warning when remainSec reaches 0 exactly (handled by done)', async () => {
    h = setup([{ id: 1, at: 5, color: 'red', sound: 'gong' }], 30)
    h.status.value = 'running'
    await nextTick()
    h.remainSec.value = 0
    await nextTick()
    // Warning at 5 should not fire because remainSec hit 0 directly (intSec > 0 guard)
    // But it should fire when it crossed 5
    // Actually here we jumped from 30 → 0 in one step, so it crosses 5 too
    // The implementation checks intSec > 0, so at remainSec=0 (intSec=0) it won't fire
    expect(h.onTrigger).not.toHaveBeenCalled()
  })
})
