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
//
// drumGong (鏘鏘) uses two CC0 mp3 samples (freesound.org — see
// AUDIO_CREDITS.md) layered with an A2 envelope: D = strike, C = resonance.
import { ref } from 'vue'
import type { SoundKey } from '../types'
import politeUrl from '../assets/audio/polite.m4a'
import cheerUrl from '../assets/audio/cheer.m4a'
import drumGongCUrl from '../assets/audio/drumGong-C.mp3'
import drumGongDUrl from '../assets/audio/drumGong-D.mp3'

// Internal keys for the buffer cache. SoundKey 'drumGong' expands to two
// buffer fetches (C resonance + D strike); other buffer-backed sounds map 1:1.
type BufferKey = 'polite' | 'cheer' | 'drumGongC' | 'drumGongD'

const BUFFER_URLS: Record<BufferKey, string> = {
  polite: politeUrl,
  cheer: cheerUrl,
  drumGongC: drumGongCUrl,
  drumGongD: drumGongDUrl,
}

let audioCtx: AudioContext | null = null
const unlocked = ref(false)

const bufferCache = new Map<BufferKey, AudioBuffer>()
const bufferLoading = new Map<BufferKey, Promise<AudioBuffer>>()

// Track the currently-playing clap so a new trigger (or reset) can fade it out
// instead of overlapping. Stored at module scope because useAudio() is a
// per-call factory but the underlying audio state is global.
let currentClap: { src: AudioBufferSourceNode; gain: GainNode } | null = null

// Same idea for drumGong, which has two layered buffer sources (strike + resonance)
// routed through a shared master gain. stopAll() fades the master and stops both.
let currentDrumGong: {
  dSrc: AudioBufferSourceNode
  cSrc: AudioBufferSourceNode
  master: GainNode
} | null = null

// Track every still-scheduled oscillator + its gain so stopAll() can silence
// them when the timer state changes (start/pause/reset/restart). Synthesized
// tones don't expose onended cleanly across browsers; we register cleanup
// via setTimeout matching the scheduled stop time.
const activeTones = new Set<{ osc: OscillatorNode; gain: GainNode }>()

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

// Map a SoundKey to the buffer keys it needs. Most buffer-backed sounds are
// 1:1; drumGong needs two (C + D).
function bufferKeysFor(kind: SoundKey): BufferKey[] {
  if (kind === 'polite') return ['polite']
  if (kind === 'cheer') return ['cheer']
  if (kind === 'drumGong') return ['drumGongC', 'drumGongD']
  return []
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

  const entry = { osc, gain }
  activeTones.add(entry)
  // Drop from the active set once the scheduled tail finishes, so a later
  // stopAll() doesn't try to stop nodes the browser already cleaned up.
  const lifetimeMs = Math.max(0, (endAt + 0.1 - now) * 1000)
  setTimeout(() => activeTones.delete(entry), lifetimeMs)
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

// 50ms exponential fade on the shared master gain so both layered sources
// drop together without click, then stop the underlying buffer sources.
function stopCurrentDrumGong(ctx: AudioContext): void {
  if (!currentDrumGong) return
  const { dSrc, cSrc, master } = currentDrumGong
  const now = ctx.currentTime
  try {
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
    dSrc.stop(now + 0.06)
    cSrc.stop(now + 0.06)
  } catch {
    // Already stopped — ignore.
  }
  currentDrumGong = null
}

function playClapBuffer(ctx: AudioContext, kind: 'polite' | 'cheer'): void {
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

// drumGong A2 recipe — picked after extensive A/B listening against bigtimer.net.
// D = the strike (sharp attack, gain 1.3), C = the resonance (silent for
// 200ms, linear fade-in to 0.35 by 400ms, then exponential decay to 1.6s).
// Master gain 0.85 prevents clipping when peaks overlap.
// All envelope values stay ≥ 0.0001 per iPad Safari rules (Bug #9).
function playDrumGong(ctx: AudioContext): void {
  const C = bufferCache.get('drumGongC')
  const D = bufferCache.get('drumGongD')
  if (!C || !D) {
    // Kick off loads and fall back to bell so user still hears something.
    void loadBuffer('drumGongC').catch((e) =>
      console.warn('[tickle] loadBuffer drumGongC failed', e),
    )
    void loadBuffer('drumGongD').catch((e) =>
      console.warn('[tickle] loadBuffer drumGongD failed', e),
    )
    console.warn('[tickle] drumGong buffers not ready, falling back to bell')
    const now = ctx.currentTime
    scheduleTone(ctx, now, { freq: 880, peak: 0.3, attack: 0.01, duration: 1.2 })
    return
  }

  // A new strike supersedes any in-flight drumGong; stop the previous one
  // so overlapping presses don't pile up.
  stopCurrentDrumGong(ctx)

  const now = ctx.currentTime

  // Master gain — prevents clipping when D(1.3) + C(0.35) peaks overlap.
  const master = ctx.createGain()
  master.gain.value = 0.85
  master.connect(ctx.destination)

  // D — the strike: full attack, no envelope, gain 1.3.
  const dSrc = ctx.createBufferSource()
  dSrc.buffer = D
  const dGain = ctx.createGain()
  dGain.gain.value = 1.3
  dSrc.connect(dGain).connect(master)
  dSrc.start(now)

  // C — the resonance: silent for 200ms, fade in to 0.35 over 200ms,
  // hold briefly, then exponential decay to 0.0001 over 1.2s.
  const cSrc = ctx.createBufferSource()
  cSrc.buffer = C
  const cGain = ctx.createGain()
  const fadeInStart = now + 0.20
  const fadeInEnd = now + 0.40
  const fadeOutEnd = now + 1.60
  cGain.gain.setValueAtTime(0.0001, now)
  cGain.gain.setValueAtTime(0.0001, fadeInStart)
  cGain.gain.linearRampToValueAtTime(0.35, fadeInEnd)
  cGain.gain.exponentialRampToValueAtTime(0.0001, fadeOutEnd)
  cSrc.connect(cGain).connect(master)
  cSrc.start(now)

  currentDrumGong = { dSrc, cSrc, master }
  dSrc.onended = () => {
    if (currentDrumGong?.dSrc === dSrc) {
      // Only clear when the resonance has also faded; the strike ends first.
    }
  }
  cSrc.onended = () => {
    if (currentDrumGong?.cSrc === cSrc) currentDrumGong = null
  }
}

// Hard-stop every scheduled sound. Used when the timer state changes (start /
// pause / reset / restart / repeat re-arm) so audio never outlives its run.
// We schedule a 5ms linear ramp to ~0 before .stop() to avoid the audible
// click that comes from cutting a sine mid-cycle on iPad Safari.
function stopAllSounds(): void {
  if (!audioCtx) return
  const ctx = audioCtx
  const now = ctx.currentTime

  for (const { osc, gain } of activeTones) {
    try {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now)
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.005)
      osc.stop(now + 0.01)
    } catch {
      // Already stopped — ignore.
    }
  }
  activeTones.clear()

  stopCurrentClap(ctx)
  stopCurrentDrumGong(ctx)
}

export function useAudio() {
  async function ensureAudio(): Promise<void> {
    const ctx = getCtx()
    console.log('[tickle] ensureAudio start, state =', ctx.state)
    await warmUp(ctx)
    console.log('[tickle] ensureAudio done, state =', ctx.state)
    unlocked.value = true
  }

  // Pre-fetch + decode buffer(s) for a sound. UI should call this when the
  // user selects a buffer-backed option in a sound dropdown, so the buffer is
  // ready by the time the warning fires. Safe to call repeatedly (cached).
  function preloadSound(kind: SoundKey): void {
    const keys = bufferKeysFor(kind)
    keys.forEach((k) => {
      void loadBuffer(k).catch((e) => console.warn('[tickle] preload failed', k, e))
    })
  }

  function playSound(kind: SoundKey): void {
    const ctx = getCtx()
    // Best-effort resume — if context is already running this is a no-op.
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    // Always log in production too, since iPad debugging needs this.
    console.log('[tickle] playSound', kind, 'ctx.state =', ctx.state)

    if (kind === 'polite' || kind === 'cheer') {
      playClapBuffer(ctx, kind)
      return
    }
    if (kind === 'drumGong') {
      playDrumGong(ctx)
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

  function stopAll(): void {
    stopAllSounds()
  }

  return { ensureAudio, playSound, preloadSound, stopAll, unlocked }
}
