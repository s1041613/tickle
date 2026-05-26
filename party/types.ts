/**
 * Shared types for the PartyKit room-sync server.
 *
 * Both the server (party/server.ts) and the client composable
 * (src/composables/useRoomSync.ts) talk in terms of `ClientMessage` /
 * `ServerMessage` discriminated unions. Keep the wire format tight —
 * every field that crosses the WebSocket lives here.
 *
 * Note: we re-declare `ColorKey` / `SoundKey` / `Warning` here instead
 * of importing from `src/types.ts` because PartyKit deploys this folder
 * to Cloudflare Workers — pulling Vue/SFC files in would balloon the
 * bundle. The shapes must stay in sync with `src/types.ts`; if you
 * change one, change the other.
 */

export type ColorKey = 'yellow' | 'orange' | 'red'

export type SoundKey =
  | 'chime'
  | 'bell'
  | 'gong'
  | 'polite'
  | 'cheer'
  | 'drumGong'

export interface Warning {
  id: number
  at: number
  color: ColorKey
  sound: SoundKey
}

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

/**
 * Authoritative room state owned by the PartyKit Durable Object.
 * Persisted in DO storage under the key `state`. Broadcast verbatim
 * via `hydrate` / `update` messages.
 *
 * `hostToken` is sensitive — server-only field. The wire payload also
 * carries it (so the host client can confirm "yep, that's mine"), but
 * the value should only ever leave the server back to the host. Viewer
 * clients also receive it on `hydrate`/`update` for simplicity — we
 * treat any client holding the room URL as already trusted enough to
 * see the token (URL is the carrier in the first place). If we ever
 * want stricter handling, filter it out in `broadcastUpdate`.
 */
export interface RoomState {
  /** 6-char room id, generated server-side */
  roomId: string
  /** `ht_` + 16 chars, generated server-side */
  hostToken: string
  /** seconds; default 300 */
  duration: number
  /** when running/paused: absolute server-time ms when remaining hits 0 */
  endAtMs: number | null
  /** when paused: remaining seconds at the moment of pause */
  pausedRemainSec: number | null
  /** current timer phase */
  status: TimerStatus
  /** loop on done */
  repeat: boolean
  /** warning thresholds + sounds */
  warnings: Warning[]
  /** sound played when timer hits 0 */
  finalSound: SoundKey
  /** which conn currently "owns" host write privileges; null when host is offline */
  activeHostConnId: string | null
}

/** Subset of RoomState that hosts are allowed to mutate via patch. */
export type RoomStatePatch = Partial<
  Pick<
    RoomState,
    | 'duration'
    | 'endAtMs'
    | 'pausedRemainSec'
    | 'status'
    | 'repeat'
    | 'warnings'
    | 'finalSound'
  >
>

// ---------- Client → Server ----------

export type ClientMessage =
  | { type: 'ping'; t1: number }
  | { type: 'patch'; hostToken: string; changes: RoomStatePatch }

// ---------- Server → Client ----------

export type ServerErrorCode =
  | 'forbidden'
  | 'room-not-found'
  | 'bad-message'

export type ServerMessage =
  | { type: 'hydrate'; state: RoomState; serverNow: number }
  | { type: 'update'; state: RoomState; serverNow: number }
  | { type: 'pong'; t1: number; t2: number; t3: number }
  | { type: 'kicked'; reason: 'replaced' }
  | { type: 'error'; code: ServerErrorCode; detail?: string }

// ---------- Defaults ----------

export const DEFAULT_WARNINGS: Warning[] = [
  { id: 1, at: 60, color: 'yellow', sound: 'chime' },
  { id: 2, at: 30, color: 'orange', sound: 'bell' },
  { id: 3, at: 10, color: 'red', sound: 'chime' },
]

export const DEFAULT_FINAL_SOUND: SoundKey = 'gong'

export const DEFAULT_DURATION_SEC = 300
