import { watchEffect, type Ref } from 'vue'
import type { TimerStatus } from './useTimer'

export function useTabTitle(formatted: Ref<string>, status: Ref<TimerStatus>) {
  watchEffect(() => {
    if (status.value === 'running' || status.value === 'paused') {
      document.title = `⏱ ${formatted.value} — BigTimer`
    } else if (status.value === 'done') {
      document.title = '⏰ 時間到 — BigTimer'
    } else {
      document.title = 'BigTimer'
    }
  })
}
