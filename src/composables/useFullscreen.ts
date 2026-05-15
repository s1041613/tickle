import { ref, onScopeDispose, type Ref } from 'vue'

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void>
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>
}

function getFsElement(): Element | null {
  const d = document as FullscreenDocument
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

function detectSupport(): boolean {
  const root = document.documentElement as FullscreenElement
  return typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function'
}

export interface UseFullscreen {
  isFullscreen: Ref<boolean>
  isSupported: Ref<boolean>
  toggle: () => Promise<void>
}

export function useFullscreen(): UseFullscreen {
  const isFullscreen = ref(false)
  const isSupported = ref(detectSupport())

  function syncState(): void {
    isFullscreen.value = getFsElement() !== null
  }

  async function enter(): Promise<void> {
    const root = document.documentElement as FullscreenElement
    if (typeof root.requestFullscreen === 'function') {
      await root.requestFullscreen()
    } else if (typeof root.webkitRequestFullscreen === 'function') {
      await root.webkitRequestFullscreen()
    }
  }

  async function exit(): Promise<void> {
    const d = document as FullscreenDocument
    if (typeof document.exitFullscreen === 'function') {
      await document.exitFullscreen()
    } else if (typeof d.webkitExitFullscreen === 'function') {
      await d.webkitExitFullscreen()
    }
  }

  async function toggle(): Promise<void> {
    if (!isSupported.value) return
    try {
      if (getFsElement() === null) {
        await enter()
      } else {
        await exit()
      }
    } catch {
      // user denied, or browser refused — leave state to fullscreenchange listener
    }
  }

  document.addEventListener('fullscreenchange', syncState)
  document.addEventListener('webkitfullscreenchange', syncState)

  // Sync once in case we mount while already in fullscreen (rare but cheap).
  syncState()

  onScopeDispose(() => {
    document.removeEventListener('fullscreenchange', syncState)
    document.removeEventListener('webkitfullscreenchange', syncState)
  })

  return { isFullscreen, isSupported, toggle }
}
