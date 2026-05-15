import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { useFullscreen, type UseFullscreen } from '../../src/composables/useFullscreen'

function createFs(): { fs: UseFullscreen; scope: EffectScope } {
  const scope = effectScope()
  let fs!: UseFullscreen
  scope.run(() => {
    fs = useFullscreen()
  })
  return { fs, scope }
}

interface FsDoc {
  fullscreenElement: Element | null
  exitFullscreen: () => Promise<void>
}
interface FsRoot {
  requestFullscreen: () => Promise<void>
}

function setupFullscreenApi() {
  let current: Element | null = null
  const requestFullscreen = vi.fn(async () => {
    current = document.documentElement
    ;(document as unknown as FsDoc).fullscreenElement = current
    document.dispatchEvent(new Event('fullscreenchange'))
  })
  const exitFullscreen = vi.fn(async () => {
    current = null
    ;(document as unknown as FsDoc).fullscreenElement = null
    document.dispatchEvent(new Event('fullscreenchange'))
  })
  ;(document.documentElement as unknown as FsRoot).requestFullscreen = requestFullscreen
  ;(document as unknown as FsDoc).exitFullscreen = exitFullscreen
  ;(document as unknown as FsDoc).fullscreenElement = null
  return {
    requestFullscreen,
    exitFullscreen,
    enterFromBrowser() {
      current = document.documentElement
      ;(document as unknown as FsDoc).fullscreenElement = current
      document.dispatchEvent(new Event('fullscreenchange'))
    },
    exitFromBrowser() {
      current = null
      ;(document as unknown as FsDoc).fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
    },
  }
}

describe('useFullscreen', () => {
  let scope: EffectScope

  beforeEach(() => {
    delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen
    delete (document.documentElement as unknown as Record<string, unknown>).webkitRequestFullscreen
    delete (document as unknown as Record<string, unknown>).exitFullscreen
    delete (document as unknown as Record<string, unknown>).webkitExitFullscreen
    ;(document as unknown as FsDoc).fullscreenElement = null
  })

  afterEach(() => {
    scope?.stop()
  })

  it('F1: initial isFullscreen is false', () => {
    setupFullscreenApi()
    const { fs, scope: s } = createFs()
    scope = s
    expect(fs.isFullscreen.value).toBe(false)
  })

  it('F2: isSupported is false when API is missing', () => {
    const { fs, scope: s } = createFs()
    scope = s
    expect(fs.isSupported.value).toBe(false)
  })

  it('F2b: isSupported is true when requestFullscreen exists', () => {
    setupFullscreenApi()
    const { fs, scope: s } = createFs()
    scope = s
    expect(fs.isSupported.value).toBe(true)
  })

  it('F3: fullscreenchange event syncs isFullscreen', () => {
    const api = setupFullscreenApi()
    const { fs, scope: s } = createFs()
    scope = s
    expect(fs.isFullscreen.value).toBe(false)
    api.enterFromBrowser()
    expect(fs.isFullscreen.value).toBe(true)
    api.exitFromBrowser()
    expect(fs.isFullscreen.value).toBe(false)
  })

  it('F4: toggle() calls requestFullscreen when not fullscreen', async () => {
    const api = setupFullscreenApi()
    const { fs, scope: s } = createFs()
    scope = s
    await fs.toggle()
    expect(api.requestFullscreen).toHaveBeenCalledTimes(1)
    expect(api.exitFullscreen).not.toHaveBeenCalled()
    expect(fs.isFullscreen.value).toBe(true)
  })

  it('F5: toggle() calls exitFullscreen when already fullscreen', async () => {
    const api = setupFullscreenApi()
    const { fs, scope: s } = createFs()
    scope = s
    api.enterFromBrowser()
    expect(fs.isFullscreen.value).toBe(true)
    await fs.toggle()
    expect(api.exitFullscreen).toHaveBeenCalledTimes(1)
    expect(api.requestFullscreen).not.toHaveBeenCalled()
    expect(fs.isFullscreen.value).toBe(false)
  })

  it('F6: toggle() is a no-op when unsupported', async () => {
    const { fs, scope: s } = createFs()
    scope = s
    await fs.toggle()
    expect(fs.isFullscreen.value).toBe(false)
  })

  it('F7: scope.stop() removes event listeners', () => {
    const api = setupFullscreenApi()
    const { fs, scope: s } = createFs()
    s.stop()
    api.enterFromBrowser()
    expect(fs.isFullscreen.value).toBe(false)
    scope = effectScope()
  })

  it('F8: toggle() swallows enter rejection without leaving stale state', async () => {
    const requestFullscreen = vi.fn(async () => {
      throw new Error('user denied')
    })
    ;(document.documentElement as unknown as FsRoot).requestFullscreen = requestFullscreen
    ;(document as unknown as FsDoc).fullscreenElement = null
    const { fs, scope: s } = createFs()
    scope = s
    await fs.toggle()
    expect(requestFullscreen).toHaveBeenCalled()
    expect(fs.isFullscreen.value).toBe(false)
  })
})
