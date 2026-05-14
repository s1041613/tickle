// iPad Safari Web Audio gotchas — see docs/DECISIONS.md bug #9.
// TL;DR before editing this file:
//   1. exponentialRampToValueAtTime values MUST be > 0 (use 0.0001 minimum)
//   2. AudioContext.resume() MUST be awaited inside the user gesture
//   3. Schedule at least one audio node in the same gesture (warmUp does this)
// Desktop browsers tolerate violations; iPad Safari silently drops audio.
//
// Clap sounds (polite, cheer) are real recordings (CC0 / Mixkit Free
// License) — see DECISIONS.md §1 "exception". They use fetch + decodeAudioData
// + AudioBufferSourceNode, NOT <audio> elements (which iPad Safari handles
// poorly under the same Web Audio unlock path).
import { ref } from 'vue'
import type { SoundKey } from '../types'
import politeUrl from '../assets/audio/polite.m4a'
import cheerUrl from '../assets/audio/cheer.m4a'

type BufferKey = Extract<SoundKey, 'polite' | 'cheer'>

const BUFFER_URLS: Record<BufferKey, string> = {
  polite: politeUrl,
  cheer: cheerUrl,
}

let audioCtx: AudioContext | null = null
const unlocked = ref(false)

const bufferCache = new Map<BufferKey, AudioBuffer>()
const bufferLoading = new Map<BufferKey, Promise<AudioBuffer>>()

// Track the currently-playing clap so a new trigger (or reset) can fade it out
// instead of overlapping. Stored at module scope because useAudio() is a
// per-call factory but the underlying audio state is global.
let currentClap: { src: AudioBufferSourceNode; gain: GainNode } | null = null

function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = new Ctor()
  }
  return audioCtx
}

// iOS Safari quirk: AudioContext.resume() must be awaited within the same
// user-gesture call stack, and the first audio node must also be scheduled
// in that gesture. We play a near-silent 1-sample buffer to "warm up" the
// audio pipeline; subsequent playSound() calls from timers will work.
async function warmUp(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }
  const buffer = ctx.createBuffer(1, 1, 22050)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start(0)
}

function isBufferKey(kind: SoundKey): kind is BufferKey {
  return kind === 'polite' || kind === 'cheer'
}

async function loadBuffer(kind: BufferKey): Promise<AudioBuffer> {
  const cached = bufferCache.get(kind)
  if (cached) return cached
  const pending = bufferLoading.get(kind)
  if (pending) return pending
  const ctx = getCtx()
  const promise = fetch(BUFFER_URLS[kind])
    .then((r) => r.arrayBuffer())
    .then((ab) => ctx.decodeAudioData(ab))
    .then((buf) => {
      bufferCache.set(kind, buf)
      bufferLoading.delete(kind)
      return buf
    })
    .catch((err) => {
      bufferLoading.delete(kind)
      throw err
    })
  bufferLoading.set(kind, promise)
  return promise
}

interface OscDef {
  freq: number
  /** Peak gain (linear, 0–1). Must be > 0. */
  peak: number
  /** Attack time in seconds. */
  attack: number
  /** Total duration including release tail. */
  duration: number
  /** Start offset relative to "now". */
  startOffset?: number
}

function scheduleTone(ctx: AudioContext, now: number, def: OscDef): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = def.freq

  const start = now + (def.startOffset ?? 0)
  const peakAt = start + def.attack
  const endAt = start + def.duration

  // iOS Safari requires exponentialRampToValueAtTime to start from a strictly
  // positive value — otherwise the entire schedule is silently dropped.
  // We use 0.0001 as the floor (effectively inaudible).
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(def.peak, peakAt)
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt)

  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(endAt + 0.05)
}

// 50ms exponential fade-out before tearing down the current clap, so a new
// trigger (or a reset/restart) doesn't cause a hard click.
function stopCurrentClap(ctx: AudioContext): void {
  if (!currentClap) return
  const { src, gain } = currentClap
  const now = ctx.currentTime
  try {
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
    src.stop(now + 0.06)
  } catch {
    // Already stopped — ignore.
  }
  currentClap = null
}

function playBuffer(ctx: AudioContext, kind: BufferKey): void {
  const buffer = bufferCache.get(kind)
  if (!buffer) {
    // Not loaded yet — kick off a load and fall back to a bell tone so the
    // user still hears *something*. The next trigger will hit the cache.
    void loadBuffer(kind).catch((e) => console.warn('[tickle] loadBuffer failed', kind, e))
    console.warn('[tickle] clap buffer not ready, falling back to bell', kind)
    const now = ctx.currentTime
    scheduleTone(ctx, now, { freq: 880, peak: 0.3, attack: 0.01, duration: 1.2 })
    return
  }

  stopCurrentClap(ctx)

  const src = ctx.createBufferSource()
  src.buffer = buffer
  const gain = ctx.createGain()
  const now = ctx.currentTime
  // Start at audible level — buffer recordings are already mastered, no
  // attack ramp needed. Keep ≥ 0.0001 so future fade-out exponential ramps
  // remain legal on iPad Safari.
  gain.gain.setValueAtTime(0.7, now)
  src.connect(gain).connect(ctx.destination)
  src.start(now)
  src.onended = () => {
    if (currentClap?.src === src) currentClap = null
  }
  currentClap = { src, gain }
}

export function useAudio() {
  async function ensureAudio(): Promise<void> {
    const ctx = getCtx()
    console.log('[tickle] ensureAudio start, state =', ctx.state)
    await warmUp(ctx)
    console.log('[tickle] ensureAudio done, state =', ctx.state)
    unlocked.value = true
  }

  // Pre-fetch + decode a clap buffer. UI should call this when the user
  // selects a clap option in a sound dropdown, so the buffer is ready by
  // the time the warning fires. Safe to call repeatedly (cached).
  function preloadSound(kind: SoundKey): void {
    if (!isBufferKey(kind)) return
    void loadBuffer(kind).catch((e) => console.warn('[tickle] preload failed', kind, e))
  }

  function playSound(kind: SoundKey): void {
    const ctx = getCtx()
    // Best-effort resume — if context is already running this is a no-op.
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    // Always log in production too, since iPad debugging needs this.
    console.log('[tickle] playSound', kind, 'ctx.state =', ctx.state)

    if (isBufferKey(kind)) {
      playBuffer(ctx, kind)
      return
    }

    const now = ctx.currentTime

    if (kind === 'gong') {
      const freqs = [82, 110, 165]
      freqs.forEach((f, i) => {
        scheduleTone(ctx, now, {
          freq: f,
          peak: 0.35 / (i + 1),
          attack: 0.02,
          duration: 2.5,
        })
      })
    } else if (kind === 'bell') {
      const fundamentals = [880, 1320]
      fundamentals.forEach((f, i) => {
        scheduleTone(ctx, now, {
          freq: f,
          peak: 0.3 / (i + 1),
          attack: 0.01,
          duration: 1.2,
        })
      })
    } else if (kind === 'chime') {
      const notes = [523.25, 659.25, 783.99]
      notes.forEach((f, i) => {
        scheduleTone(ctx, now, {
          freq: f,
          peak: 0.18,
          attack: 0.02,
          duration: 1.5,
          startOffset: i * 0.08,
        })
      })
    }
  }

  return { ensureAudio, playSound, preloadSound, unlocked }
}
