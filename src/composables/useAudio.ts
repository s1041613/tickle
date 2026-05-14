import { ref } from 'vue'
import type { SoundKey } from '../types'

let audioCtx: AudioContext | null = null
const unlocked = ref(false)

function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = new Ctor()
  }
  return audioCtx
}

export function useAudio() {
  function ensureAudio(): void {
    const ctx = getCtx()
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    unlocked.value = true
  }

  function playSound(kind: SoundKey): void {
    const ctx = getCtx()
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    if (import.meta.env.DEV) {
      console.log('[BigTimer] playSound', kind, 'ctx.state =', ctx.state)
    }
    const now = ctx.currentTime

    if (kind === 'gong') {
      const freqs = [82, 110, 165]
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = f
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.35 / (i + 1), now + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 2.5)
      })
    } else if (kind === 'bell') {
      const fundamentals = [880, 1320]
      fundamentals.forEach((f, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = f
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.3 / (i + 1), now + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 1.2)
      })
    } else if (kind === 'chime') {
      const notes = [523.25, 659.25, 783.99]
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = f
        const start = now + i * 0.08
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.18, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 1.5)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start)
        osc.stop(start + 1.5)
      })
    }
  }

  return { ensureAudio, playSound, unlocked }
}
