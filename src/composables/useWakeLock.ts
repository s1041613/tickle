import { watch, onBeforeUnmount, type Ref } from 'vue'
import type { TimerStatus } from './useTimer'

interface WakeLockSentinel {
  release: () => Promise<void>
  released: boolean
  addEventListener: (type: 'release', listener: () => void) => void
}

interface WakeLockApi {
  request: (type: 'screen') => Promise<WakeLockSentinel>
}

function getWakeLock(): WakeLockApi | null {
  const nav = navigator as unknown as { wakeLock?: WakeLockApi }
  return nav.wakeLock ?? null
}

export function useWakeLock(status: Ref<TimerStatus>) {
  let sentinel: WakeLockSentinel | null = null

  async function acquire(): Promise<void> {
    const api = getWakeLock()
    if (!api) return
    try {
      sentinel = await api.request('screen')
    } catch {
      sentinel = null
    }
  }

  async function release(): Promise<void> {
    if (!sentinel) return
    try {
      await sentinel.release()
    } catch {
      // ignore
    }
    sentinel = null
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible' && status.value === 'running' && !sentinel) {
      void acquire()
    }
  }

  watch(status, (s) => {
    if (s === 'running') {
      void acquire()
    } else {
      void release()
    }
  })

  document.addEventListener('visibilitychange', onVisibilityChange)

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void release()
  })
}
