// iPad Safari Web Audio gotchas — see docs/DECISIONS.md bug #9.
// TL;DR before editing this file:
//   1. exponentialRampToValueAtTime values MUST be > 0 (use 0.0001 minimum)
//   2. AudioContext.resume() MUST be awaited inside the user gesture
//   3. Schedule at least one audio node in the same gesture (warmUp does this)
// Desktop browsers tolerate violations; iPad Safari silently drops audio.
import { ref } from 'vue'
import type { SoundKey } from '../types'

let audioCtx: AudioContext | null = null
const unlocked = ref(false)

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

export function useAudio() {
  async function ensureAudio(): Promise<void> {
    const ctx = getCtx()
    console.log('[tickle] ensureAudio start, state =', ctx.state)
    await warmUp(ctx)
    console.log('[tickle] ensureAudio done, state =', ctx.state)
    unlocked.value = true
  }

  function playSound(kind: SoundKey): void {
    const ctx = getCtx()
    // Best-effort resume — if context is already running this is a no-op.
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    // Always log in production too, since iPad debugging needs this.
    console.log('[tickle] playSound', kind, 'ctx.state =', ctx.state)
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

  return { ensureAudio, playSound, unlocked }
}
