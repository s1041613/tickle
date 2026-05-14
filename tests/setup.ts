import { afterEach, vi } from 'vitest'

// jsdom does not provide DragEvent — polyfill it so tests can instantiate it
if (typeof DragEvent === 'undefined') {
  globalThis.DragEvent = class DragEvent extends MouseEvent {
    dataTransfer: DataTransfer | null = null
    constructor(type: string, init?: DragEventInit) {
      super(type, init)
      this.dataTransfer = init?.dataTransfer ?? null
    }
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
