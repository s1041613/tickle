/**
 * URL <-> Tickle state, take 2.
 *
 * Old behaviour (pre-room-sync): the URL was the source of truth.
 * Every settings ref was two-way bound to a query param so the link
 * captured the full state. See docs/DECISIONS.md "URL 包含所有狀態"
 * (now deprecated).
 *
 * New behaviour (room-sync): the URL is just a pointer.
 *   - `?room=<id>&host=<token>` — host link (carries control privilege)
 *   - `?room=<id>` — viewer link (read-only)
 *   - any legacy params (`seconds`/`warn`/`repeat`/`final`) are read ONCE
 *     at first visit, seeded into the new room, and then stripped from
 *     the URL.
 *
 * This module is now a thin URL helper — no Vue reactivity, no watch.
 * The previously-exported `parseWarnings` / `serializeWarnings` stay
 * because they encode the legacy URL format used in `seed=` payloads
 * and in the parser below.
 */
import type { Warning, ColorKey, SoundKey } from '../types'

const VALID_COLORS: ColorKey[] = ['yellow', 'orange', 'red']
const VALID_SOUNDS: SoundKey[] = [
  'chime',
  'bell',
  'gong',
  'polite',
  'cheer',
  'drumGong',
]

function isColor(s: string): s is ColorKey {
  return (VALID_COLORS as string[]).includes(s)
}

function isSound(s: string): s is SoundKey {
  return (VALID_SOUNDS as string[]).includes(s)
}

/**
 * Parse the `warn` query-string format: `<seconds>:<color>:<sound>` items
 * joined by commas. Returns `null` for null/empty input and silently
 * drops malformed items. Kept exported because legacy URL imports and
 * tests still go through this codepath.
 */
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

/** Inverse of `parseWarnings`. Kept exported for tests + legacy callers. */
export function serializeWarnings(warnings: Warning[]): string {
  return warnings.map((w) => `${w.at}:${w.color}:${w.sound}`).join(',')
}

// ---------- Legacy URL → seed values ----------

export interface LegacyUrlValues {
  duration?: number
  warnings?: Warning[]
  repeat?: boolean
  finalSound?: SoundKey
}

/**
 * Parse legacy params (`seconds`/`warn`/`repeat`/`final`) from a search
 * string. Returns only the keys that were present + valid; missing or
 * invalid values are left out so callers can fall back to defaults.
 *
 * Default param source is `window.location.search`; pass a string for
 * tests / non-window callers.
 */
export function loadFromLegacyUrl(search?: string): LegacyUrlValues {
  const params = new URLSearchParams(search ?? window.location.search)
  const out: LegacyUrlValues = {}

  const sec = Number(params.get('seconds'))
  if (Number.isFinite(sec) && sec > 0) out.duration = Math.floor(sec)

  const warn = parseWarnings(params.get('warn'))
  if (warn && warn.length > 0) out.warnings = warn

  const rep = params.get('repeat')
  if (rep !== null) out.repeat = rep === 'true' || rep === '1'

  const fs = params.get('final')
  if (fs && isSound(fs)) out.finalSound = fs

  return out
}

/**
 * True if the current URL has any of the legacy state params. Cheap
 * check so callers can skip seeding when there's nothing to import.
 */
export function hasLegacyUrlParams(search?: string): boolean {
  const params = new URLSearchParams(search ?? window.location.search)
  return (
    params.has('seconds') ||
    params.has('warn') ||
    params.has('repeat') ||
    params.has('final')
  )
}

// ---------- Room / host param read/write ----------

/** Read `?room=` from current URL. Returns null if absent or empty. */
export function readRoomParam(): string | null {
  const v = new URLSearchParams(window.location.search).get('room')
  return v && v.length > 0 ? v : null
}

/** Read `?host=` from current URL. Returns null if absent or empty. */
export function readHostParam(): string | null {
  const v = new URLSearchParams(window.location.search).get('host')
  return v && v.length > 0 ? v : null
}

/**
 * Replace the URL with a clean `?room=<id>` (or `?room=<id>&host=<token>`
 * when `hostToken` is non-null). Uses `history.replaceState` so back/forward
 * stays sensible.
 *
 * - `hostToken = null` means "this is the viewer URL" — host param is
 *   removed.
 * - `hostToken = undefined` would be ambiguous; the type forces callers
 *   to be explicit.
 */
export function writeRoomAndHost(
  roomId: string,
  hostToken: string | null,
): void {
  const params = new URLSearchParams()
  params.set('room', roomId)
  if (hostToken) params.set('host', hostToken)
  const qs = params.toString()
  const newUrl = `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`
  window.history.replaceState(null, '', newUrl)
}

/**
 * Strip legacy state params from the URL but keep `room` + `host`. Used
 * once after a new room is created from a legacy-paramed URL.
 *
 * Safety: if there's no `room` param yet, do nothing — we don't want to
 * clobber the URL of someone whose room hasn't been created yet (rare
 * race during create flow).
 */
export function clearLegacyUrlParams(): void {
  const current = new URLSearchParams(window.location.search)
  const room = current.get('room')
  if (!room) return // bail — room not yet established

  const next = new URLSearchParams()
  next.set('room', room)
  const host = current.get('host')
  if (host) next.set('host', host)

  // Skip the history write when nothing actually changes (avoids a
  // useless replaceState that some browsers count toward navigation
  // history limits).
  const before = current.toString()
  const after = next.toString()
  if (before === after) return

  const qs = after
  const newUrl = `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`
  window.history.replaceState(null, '', newUrl)
}

