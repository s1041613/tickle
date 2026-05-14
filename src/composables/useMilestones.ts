import { ref, watch, type Ref } from 'vue'
import type { Warning, TimerState } from '../types'
import { COLOR_TO_STATE } from '../types'
import type { TimerStatus } from './useTimer'

export function useMilestones(
  remainSec: Ref<number>,
  status: Ref<TimerStatus>,
  warnings: Ref<Warning[]>,
  onTrigger: (w: Warning) => void,
) {
  const triggered = ref(new Set<number>())
  const visualState = ref<TimerState>('default')
  const activeLabel = ref('')

  watch(status, (s, prev) => {
    if (s === 'idle') {
      triggered.value = new Set()
      visualState.value = 'default'
      activeLabel.value = ''
    } else if (s === 'paused') {
      // keep visualState as-is; just stop animations conceptually
    } else if (s === 'running') {
      // Fresh start (from idle or restart from done): clear all warning state.
      if (prev === 'idle' || prev === 'done') {
        triggered.value = new Set()
        visualState.value = 'default'
        activeLabel.value = ''
      }
    } else if (s === 'done') {
      visualState.value = 'done'
      activeLabel.value = '⏰ 時間到'
    }
  })

  watch(remainSec, (r) => {
    if (status.value !== 'running') return
    const intSec = Math.ceil(r)

    for (const w of warnings.value) {
      if (!triggered.value.has(w.id) && intSec <= w.at && intSec > 0) {
        triggered.value.add(w.id)
        visualState.value = COLOR_TO_STATE[w.color]
        activeLabel.value = `剩 ${w.at} 秒`
        onTrigger(w)
      }
    }
  })

  return { visualState, activeLabel, triggered }
}
