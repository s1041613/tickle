/**
 * WebSocket connection + reactive state for one Tickle room.
 *
 * Wire protocol lives in `party/types.ts`; this composable is the
 * mirror image on the client side. PartyKit's `partysocket` handles
 * reconnect/backoff for us — we just react to messages.
 *
 * Responsibilities:
 *   1. Open the WebSocket with the right intent (`create` / `host` /
 *      `viewer`), retrying with a fresh room id when the server
 *      reports `room-already-exists` (up to 5 tries).
 *   2. Keep a reactive mirror of server state (`roomState`).
 *   3. Maintain a clock offset between client and server so the timer
 *      can render `remaining = endAtMs - (Date.now() + clockOffset)`
 *      with sub-100ms accuracy.
 *   4. Expose `sendPatch()` for the host; viewers don't have a token
 *      so calling it is a no-op (we still validate, but assume App.vue
 *      already gates the call behind `isHost`).
 *   5. Surface lifecycle events the App.vue layer needs to react to:
 *      `kicked` / `roomNotFound` / `connected` / `created`.
 *
 * Important non-goals:
 *   - This composable does NOT touch the URL. URL handling lives in
 *     `useUrlSync` so the two concerns don't intermix.
 *   - It does NOT know about `useTimer` or `useAudio`. Reverse-importing
 *     other composables is forbidden (see CLAUDE.md). App.vue wires the
 *     pieces together.
 */
import { onBeforeUnmount, reactive, readonly, ref, shallowRef } from 'vue'
import PartySocket from 'partysocket'
import type {
  ClientMessage,
  RoomState,
  RoomStatePatch,
  ServerErrorCode,
  ServerMessage,
} from '../../party/types'

// -------- ID generation (client side, mirror of party/idGen.ts) --------

// Same 31-char alphabet as the server uses for room IDs. Duplicated
// (instead of imported from `party/idGen.ts`) because Vite would have
// to bundle the entire `party/` folder otherwise — including server
// types like `Party.Server`. Keep alphabets in sync.
const ROOM_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function generateRoomId(): string {
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += ROOM_ID_ALPHABET[buf[i] % ROOM_ID_ALPHABET.length]
  }
  return out
}

// -------- Public API surface --------

/** Seed payload for `intent=create`. Sent as base64-encoded JSON. */
export interface RoomSeed {
  duration?: number
  repeat?: boolean
  warnings?: RoomState['warnings']
  finalSound?: RoomState['finalSound']
}

export type ConnectionMode =
  | { kind: 'create'; seed?: RoomSeed }
  | { kind: 'host'; roomId: string; hostToken: string }
  | { kind: 'viewer'; roomId: string }

export interface UseRoomSyncOptions {
  /** Connection target. */
  mode: ConnectionMode
  /**
   * PartyKit host. In dev this is `location.host` (Vite proxies
   * `/parties/*` → :1999). In production this is `tickle-sync.<handle>.partykit.dev`.
   * If you want auto-detect: pass `undefined` and we'll use `location.host`.
   */
  host?: string
  /** Called when server confirms a freshly-created room. */
  onCreated?: (info: { roomId: string; hostToken: string }) => void
  /** Called when server says the room doesn't exist. */
  onRoomNotFound?: () => void
  /** Called when this host conn was replaced by a newer tab. */
  onKicked?: (reason: string) => void
  /** Optional: max retry attempts for create-collision (default 5). */
  maxCreateAttempts?: number
}

export type RoomSyncStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'kicked'
  | 'room-not-found'
  | 'forbidden'

/**
 * Encode a `RoomSeed` as URL-safe base64. Returns `undefined` when seed
 * is empty so we don't append a useless query param.
 */
function encodeSeed(seed: RoomSeed | undefined): string | undefined {
  if (!seed || Object.keys(seed).length === 0) return undefined
  const json = JSON.stringify(seed)
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Compute clock offset from an NTP-style 4-timestamp sample.
 * Returns `offset` such that `serverTime ≈ Date.now() + offset`.
 *
 * Formula: `((t2 - t1) + (t3 - t4)) / 2`
 *  t1 = client send, t2 = server recv, t3 = server send, t4 = client recv
 */
function computeOffset(t1: number, t2: number, t3: number, t4: number): number {
  return ((t2 - t1) + (t3 - t4)) / 2
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length === 0) return 0
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

// -------- Composable --------

export function useRoomSync(options: UseRoomSyncOptions) {
  const status = ref<RoomSyncStatus>('connecting')
  const isConnected = ref(false)
  const isHost = ref(options.mode.kind !== 'viewer')
  /** `null` until first hydrate. We use shallowRef because RoomState is
   *  swapped wholesale on every server message — deep reactivity would
   *  re-walk warning arrays on every update for nothing. */
  const roomState = shallowRef<RoomState | null>(null)
  const clockOffset = ref(0)
  /** Latest serverNow we observed (from hydrate/update). Mostly useful
   *  for debug overlays; the timer uses `Date.now() + clockOffset`. */
  const lastServerNow = ref(0)

  // Pending clock-offset measurement samples for the current attempt.
  // Reset every time we kick off `measureClockOffset()`.
  let offsetSamples: number[] = []
  let offsetTarget = 0
  const offsetPending = new Map<number, number>() // t1 → t1 (sent timestamp)

  // Track create-collision retry attempts. Each retry generates a new
  // room id and re-opens the socket; we cap at `maxCreateAttempts`.
  const maxCreateAttempts = options.maxCreateAttempts ?? 5
  const attemptState = reactive({ count: 0, roomId: '' })

  let socket: PartySocket | null = null

  // Resolve initial room id and intent for the first connection.
  function resolveConnectionParams() {
    const mode = options.mode
    if (mode.kind === 'create') {
      attemptState.roomId = generateRoomId()
      attemptState.count = 1
      return {
        room: attemptState.roomId,
        query: {
          intent: 'create',
          ...(encodeSeed(mode.seed) ? { seed: encodeSeed(mode.seed)! } : {}),
        },
      }
    }
    if (mode.kind === 'host') {
      return {
        room: mode.roomId,
        query: { host: mode.hostToken },
      }
    }
    return { room: mode.roomId, query: {} }
  }

  // -------- Clock offset --------

  function measureClockOffset(samples = 3): void {
    if (!socket) return
    offsetSamples = []
    offsetTarget = samples
    offsetPending.clear()
    for (let i = 0; i < samples; i++) {
      // Stagger by ~30ms so PartyKit doesn't see them as a burst. Most
      // measurements complete inside the first frame anyway.
      const delay = i * 30
      setTimeout(() => sendPing(), delay)
    }
  }

  function sendPing(): void {
    if (!socket || socket.readyState !== socket.OPEN) return
    const t1 = Date.now()
    offsetPending.set(t1, t1)
    const msg: ClientMessage = { type: 'ping', t1 }
    socket.send(JSON.stringify(msg))
  }

  function handlePong(t1: number, t2: number, t3: number, t4: number): void {
    if (!offsetPending.has(t1)) return // stale or unsolicited
    offsetPending.delete(t1)
    offsetSamples.push(computeOffset(t1, t2, t3, t4))
    if (offsetSamples.length >= offsetTarget) {
      clockOffset.value = median(offsetSamples)
    }
  }

  // -------- Message handling --------

  function handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'hydrate':
      case 'update': {
        roomState.value = msg.state
        lastServerNow.value = msg.serverNow
        if (msg.type === 'hydrate') {
          // For the host create-path, surface the freshly-minted id+token
          // to the caller exactly once.
          if (
            options.mode.kind === 'create' &&
            roomState.value &&
            options.onCreated
          ) {
            options.onCreated({
              roomId: roomState.value.roomId,
              hostToken: roomState.value.hostToken,
            })
          }
          // Hydrate is also the right moment to (re)measure offset; the
          // initial connect path is one such moment.
          measureClockOffset()
        }
        return
      }
      case 'pong': {
        handlePong(msg.t1, msg.t2, msg.t3, Date.now())
        return
      }
      case 'kicked': {
        status.value = 'kicked'
        isHost.value = false
        options.onKicked?.(msg.reason)
        return
      }
      case 'error': {
        handleServerError(msg.code, msg.detail)
        return
      }
    }
  }

  function handleServerError(
    code: ServerErrorCode,
    detail?: string,
  ): void {
    if (code === 'forbidden' && detail === 'room-already-exists') {
      // Create-collision: pick a new id and retry, capped.
      if (
        options.mode.kind === 'create' &&
        attemptState.count < maxCreateAttempts
      ) {
        attemptState.count += 1
        attemptState.roomId = generateRoomId()
        rebuildSocket()
        return
      }
      // Exhausted retries — fall through to forbidden state.
      status.value = 'forbidden'
      return
    }
    if (code === 'forbidden') {
      status.value = 'forbidden'
      isHost.value = false
      return
    }
    if (code === 'room-not-found') {
      status.value = 'room-not-found'
      options.onRoomNotFound?.()
      return
    }
    if (code === 'bad-message') {
      // Should never happen with well-formed senders; log loudly so we
      // notice during dev. Don't change `status`.
      console.warn('[tickle/useRoomSync] server reported bad-message', detail)
    }
  }

  // -------- Socket lifecycle --------

  function buildSocketOptions() {
    const params = resolveConnectionParams()
    // Resolution order for the PartyKit host:
    //   1. Explicit `options.host` (lets callers override per-instance,
    //      mostly useful in tests)
    //   2. `VITE_PARTYKIT_HOST` env var (set in CI/production builds —
    //      see .github/workflows/deploy.yml + README PartyKit Backend
    //      section)
    //   3. `window.location.host` (dev default; Vite proxies
    //      `/parties/*` → localhost:1999 so the same-origin URL works)
    //
    // Note on env access: `import.meta.env.VITE_PARTYKIT_HOST` is
    // statically replaced by Vite at build time. When unset, it
    // evaluates to `undefined`, falling through to the runtime default.
    const envHost = import.meta.env.VITE_PARTYKIT_HOST as string | undefined
    const host =
      options.host ??
      (envHost && envHost.length > 0 ? envHost : window.location.host)
    // PartyKit URL form: <protocol>://<host>/parties/<party>/<room>?<query>
    // Dev (same-origin via vite proxy) → ws; production (cross-origin
    // partykit.dev) → wss. We decide on window.location.protocol so a
    // dev server accidentally exposed via HTTPS still upgrades correctly.
    const protocol: 'ws' | 'wss' =
      window.location.protocol === 'https:' ? 'wss' : 'ws'
    return {
      host,
      room: params.room,
      protocol,
      query: params.query,
    }
  }

  function rebuildSocket(): void {
    if (socket) {
      socket.close()
      socket = null
    }
    openSocket()
  }

  function openSocket(): void {
    const opts = buildSocketOptions()
    socket = new PartySocket(opts)

    socket.addEventListener('open', () => {
      isConnected.value = true
      status.value = 'connected'
    })

    socket.addEventListener('message', (ev: MessageEvent) => {
      let parsed: ServerMessage
      try {
        parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as ServerMessage
      } catch {
        console.warn('[tickle/useRoomSync] unparseable message', ev.data)
        return
      }
      handleServerMessage(parsed)
    })

    socket.addEventListener('close', () => {
      isConnected.value = false
      // Only flip to `reconnecting` if we didn't already enter a
      // terminal state (kicked / room-not-found / forbidden). Otherwise
      // partysocket will keep trying and the UI will look "busy".
      if (
        status.value !== 'kicked' &&
        status.value !== 'room-not-found' &&
        status.value !== 'forbidden'
      ) {
        status.value = 'reconnecting'
      }
    })

    socket.addEventListener('error', (ev) => {
      console.warn('[tickle/useRoomSync] socket error', ev)
    })
  }

  // -------- Public helpers --------

  /** Send a patch. Returns false if not in host mode or not connected. */
  function sendPatch(changes: RoomStatePatch): boolean {
    if (!isHost.value) return false
    const state = roomState.value
    if (!state) return false
    if (!socket || socket.readyState !== socket.OPEN) return false
    const msg: ClientMessage = {
      type: 'patch',
      hostToken: state.hostToken,
      changes,
    }
    socket.send(JSON.stringify(msg))
    return true
  }

  /** Best-effort estimate of server's `Date.now()`. */
  function serverNow(): number {
    return Date.now() + clockOffset.value
  }

  // -------- Visibility re-sync --------

  function onVisibilityChange(): void {
    if (document.visibilityState !== 'visible') return
    // Tab came back: re-measure clock offset and ask for a fresh hydrate.
    // partysocket auto-reconnects when the network was dropped; if it's
    // still open we just nudge it.
    if (socket && socket.readyState === socket.OPEN) {
      measureClockOffset()
    } else {
      // Force reopen; some browsers keep a half-closed socket alive after
      // long backgrounding.
      rebuildSocket()
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  // -------- Kick things off --------

  openSocket()

  // -------- Teardown --------

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (socket) {
      socket.close()
      socket = null
    }
  })

  return {
    /** Connection lifecycle state machine */
    status: readonly(status),
    /** True after the WebSocket has opened at least once and is alive */
    isConnected: readonly(isConnected),
    /** True for host (create / host modes); flips to false after kicked */
    isHost: readonly(isHost),
    /** Latest known authoritative room state. `null` before first hydrate. */
    roomState: readonly(roomState),
    /** Clock offset in ms, server - client */
    clockOffset: readonly(clockOffset),
    /** Latest serverNow ms observed (debug-friendly) */
    lastServerNow: readonly(lastServerNow),
    /** Send a state patch (host only); returns false if not host/connected */
    sendPatch,
    /** Convenience: `Date.now() + clockOffset` */
    serverNow,
  }
}
