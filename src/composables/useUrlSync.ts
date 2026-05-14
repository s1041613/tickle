import { watch, type Ref } from 'vue'
import type { Warning, ColorKey, SoundKey } from '../types'

const VALID_COLORS: ColorKey[] = ['yellow', 'orange', 'red']
const VALID_SOUNDS: SoundKey[] = ['chime', 'bell', 'gong', 'polite', 'cheer']

function isColor(s: string): s is ColorKey {
  return (VALID_COLORS as string[]).includes(s)
}

function isSound(s: string): s is SoundKey {
  return (VALID_SOUNDS as string[]).includes(s)
}

export function parseWarnings(raw: string | null): Warning[] | null {
  if (!raw) return null
  const items = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const result: Warning[] = []
  items.forEach((item, idx) => {
    const parts = item.split(':')
    if (parts.length < 3) return
    const at = Number(parts[0])
    const color = parts[1]
    const sound = parts[2]
    if (!Number.isFinite(at) || at <= 0) return
    if (!isColor(color) || !isSound(sound)) return
    result.push({ id: idx + 1, at, color, sound })
  })
  return result
}

export function serializeWarnings(warnings: Warning[]): string {
  return warnings.map((w) => `${w.at}:${w.color}:${w.sound}`).join(',')
}

export interface UrlSyncRefs {
  duration: Ref<number>
  repeat: Ref<boolean>
  warnings: Ref<Warning[]>
  finalSound: Ref<SoundKey>
}

export function useUrlSync(refs: UrlSyncRefs) {
  function loadFromUrl(): void {
    const p = new URLSearchParams(window.location.search)

    const sec = Number(p.get('seconds'))
    if (Number.isFinite(sec) && sec > 0) {
      refs.duration.value = sec
    }

    const rep = p.get('repeat')
    if (rep !== null) {
      refs.repeat.value = rep === 'true' || rep === '1'
    }

    const parsed = parseWarnings(p.get('warn'))
    if (parsed && parsed.length > 0) {
      refs.warnings.value = parsed
    }

    const fs = p.get('final')
    if (fs && isSound(fs)) {
      refs.finalSound.value = fs
    }
  }

  function writeToUrl(): void {
    const p = new URLSearchParams()
    p.set('seconds', String(refs.duration.value))
    if (refs.repeat.value) p.set('repeat', 'true')
    if (refs.warnings.value.length > 0) {
      p.set('warn', serializeWarnings(refs.warnings.value))
    }
    if (refs.finalSound.value !== 'gong') {
      p.set('final', refs.finalSound.value)
    }
    const qs = p.toString()
    const newUrl = `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`
    window.history.replaceState(null, '', newUrl)
  }

  loadFromUrl()

  watch(
    [refs.duration, refs.repeat, refs.warnings, refs.finalSound],
    () => writeToUrl(),
    { deep: true },
  )

  return { loadFromUrl, writeToUrl }
}
