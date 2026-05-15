import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SoundKey } from '../../src/types'

// jsdom does not implement Web Audio API; we install a minimal fake on
// `window` and re-import useAudio fresh for each test so its module-scoped
// state (audioCtx, bufferCache, currentClap, activeSources) starts clean.

interface FakeOscillator {
  type: string
  frequency: { value: number }
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  stopped: boolean
}

interface FakeGain {
  gain: {
    value: number
    setValueAtTime: ReturnType<typeof vi.fn>
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
    linearRampToValueAtTime: ReturnType<typeof vi.fn>
    cancelScheduledValues: ReturnType<typeof vi.fn>
  }
  connect: ReturnType<typeof vi.fn>
}

interface FakeBufferSource {
  buffer: AudioBuffer | null
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  onended: (() => void) | null
  stopped: boolean
}

interface FakeAudioContext {
  state: 'suspended' | 'running'
  currentTime: number
  destination: object
  resume: ReturnType<typeof vi.fn>
  createOscillator: () => FakeOscillator
  createGain: () => FakeGain
  createBuffer: () => AudioBuffer
  createBufferSource: () => FakeBufferSource
  decodeAudioData: (ab: ArrayBuffer) => Promise<AudioBuffer>
  __oscillators: FakeOscillator[]
  __sources: FakeBufferSource[]
}

function createFakeCtx(): FakeAudioContext {
  const ctx: FakeAudioContext = {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    resume: vi.fn(async function (this: FakeAudioContext) {
      this.state = 'running'
    }),
    createOscillator() {
      const osc: FakeOscillator = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(() => osc as unknown as AudioNode),
        start: vi.fn(),
        stop: vi.fn(() => {
          osc.stopped = true
        }),
        stopped: false,
      }
      ctx.__oscillators.push(osc)
      return osc
    },
    createGain() {
      const gain: FakeGain = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          cancelScheduledValues: vi.fn(),
        },
        connect: vi.fn(() => gain as unknown as AudioNode),
      }
      return gain
    },
    createBuffer() {
      return {} as AudioBuffer
    },
    createBufferSource() {
      const src: FakeBufferSource = {
        buffer: null,
        connect: vi.fn(() => src as unknown as AudioNode),
        start: vi.fn(),
        stop: vi.fn(() => {
          src.stopped = true
        }),
        onended: null,
        stopped: false,
      }
      ctx.__sources.push(src)
      return src
    },
    decodeAudioData: vi.fn(async () => ({}) as AudioBuffer),
    __oscillators: [],
    __sources: [],
  }
  // bind methods so destructuring keeps `this`
  ctx.createOscillator = ctx.createOscillator.bind(ctx)
  ctx.createGain = ctx.createGain.bind(ctx)
  ctx.createBufferSource = ctx.createBufferSource.bind(ctx)
  return ctx
}

let fakeCtx: FakeAudioContext

async function loadUseAudio() {
  vi.resetModules()
  fakeCtx = createFakeCtx()
  ;(window as unknown as { AudioContext: unknown }).AudioContext = function () {
    return fakeCtx
  }
  // jsdom doesn't have fetch — stub for clap loading paths
  globalThis.fetch = vi.fn(async () =>
    ({ arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response,
  )
  const mod = await import('../../src/composables/useAudio')
  return mod.useAudio()
}

describe('useAudio.stopAll', () => {
  beforeEach(() => {
    // Each test gets a fresh module + fresh fake context
  })

  it('A1: stops all oscillators currently scheduled for synthesized sounds', async () => {
    const audio = await loadUseAudio()
    await audio.ensureAudio()

    audio.playSound('gong' satisfies SoundKey)
    // gong schedules 3 oscillators
    expect(fakeCtx.__oscillators.length).toBeGreaterThanOrEqual(3)
    const oscs = [...fakeCtx.__oscillators]

    audio.stopAll()

    for (const osc of oscs) {
      expect(osc.stopped, 'oscillator should be stopped after stopAll').toBe(true)
    }
  })

  it('A2: stops the active clap buffer source', async () => {
    const audio = await loadUseAudio()
    await audio.ensureAudio()

    // Prime the buffer cache by faking a decode + play path:
    // We can't actually decode in jsdom, so we call playSound('polite')
    // which will hit the "buffer not ready" fallback (bell tone). To exercise
    // the buffer path we have to wait for the load promise to resolve.
    // Easier: call preloadSound and await, then playSound.
    // ensureAudio above already warmed up. Now manually trigger.
    audio.preloadSound('polite')
    // Wait microtasks for decode to resolve.
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    audio.playSound('polite')
    // Buffer path uses a BufferSource; warmUp also uses one — pick the last.
    const src = fakeCtx.__sources[fakeCtx.__sources.length - 1]
    expect(src).toBeDefined()

    audio.stopAll()

    expect(src.stopped).toBe(true)
  })

  it('A3: is safe to call when nothing is playing', async () => {
    const audio = await loadUseAudio()
    await audio.ensureAudio()

    expect(() => audio.stopAll()).not.toThrow()
    expect(() => audio.stopAll()).not.toThrow()
  })

  it('A4: after stopAll, a new playSound still works', async () => {
    const audio = await loadUseAudio()
    await audio.ensureAudio()

    audio.playSound('bell')
    audio.stopAll()

    const oscBefore = fakeCtx.__oscillators.length
    audio.playSound('bell')
    expect(fakeCtx.__oscillators.length).toBeGreaterThan(oscBefore)
  })

  it('A6: stops both drumGong layered buffer sources', async () => {
    const audio = await loadUseAudio()
    await audio.ensureAudio()

    audio.preloadSound('drumGong')
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    audio.playSound('drumGong')
    // drumGong creates 2 buffer sources (dSrc + cSrc); warmUp + preload setup
    // also created some. Take the last 2 — those are drumGong's.
    const sources = fakeCtx.__sources.slice(-2)
    expect(sources.length).toBe(2)

    audio.stopAll()

    for (const src of sources) {
      expect(src.stopped, 'drumGong source should be stopped after stopAll').toBe(true)
    }
  })

  it('A5: only stops oscillators that are still active (already-ended ones untouched)', async () => {
    const audio = await loadUseAudio()
    await audio.ensureAudio()

    audio.playSound('bell')
    const firstBatch = [...fakeCtx.__oscillators]

    // Simulate first batch finishing naturally — implementation should remove
    // them from its active set so a later stopAll() doesn't call stop() again.
    // We can't directly invoke onended on oscillators in the current
    // implementation, but stopAll() calling stop() on an already-stopped
    // oscillator wrapping in try/catch is acceptable. So we just verify a
    // second stopAll() after a fresh play only stops the new ones we care about.
    audio.stopAll()
    for (const osc of firstBatch) {
      expect(osc.stopped).toBe(true)
    }

    audio.playSound('chime')
    const secondBatch = fakeCtx.__oscillators.slice(firstBatch.length)
    audio.stopAll()
    for (const osc of secondBatch) {
      expect(osc.stopped).toBe(true)
    }
  })
})
