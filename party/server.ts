/**
 * Tickle room-sync server (PartyKit / Cloudflare Durable Objects).
 *
 * One DO instance per room id. The `party.room.id` from PartyKit is the
 * room id we expose to users. State lives in DO storage under the key
 * `state` — survives hibernation, gets fetched lazily on first message.
 *
 * Wire protocol: see party/types.ts (ClientMessage / ServerMessage).
 *
 * Connection contract (encoded via URL query when the client opens the
 * WebSocket):
 *
 *   /parties/main/<roomId>?intent=create&seed=<base64-json>
 *     → host wants to *create* this room. If storage already has state
 *       we reply `error: room-already-exists` and the client retries
 *       with a fresh id (collision recovery, up to 5 attempts).
 *
 *   /parties/main/<roomId>?host=<token>
 *     → host reconnect or new tab. We compare against stored hostToken;
 *       mismatch → `error: forbidden` + close. Match → become the
 *       activeHostConn (potentially kicking the previous host).
 *
 *   /parties/main/<roomId>
 *     → plain viewer. Empty storage → `error: room-not-found` + close.
 *       Existing storage → hydrate read-only.
 *
 * State mutations only happen via `{ type: 'patch', hostToken, changes }`
 * messages from the activeHostConn. Everything else (ping/pong, viewer
 * messages) is ignored or errored. Broadcast goes out as `update` after
 * every successful patch.
 */
import type * as Party from 'partykit/server'
import type {
  ClientMessage,
  RoomState,
  RoomStatePatch,
  ServerMessage,
} from './types'
import {
  DEFAULT_DURATION_SEC,
  DEFAULT_FINAL_SOUND,
  DEFAULT_WARNINGS,
} from './types'
import { generateHostToken } from './idGen'

/** DO storage key for the canonical room state */
const STATE_KEY = 'state'

interface CreateSeed {
  duration?: number
  repeat?: boolean
  warnings?: RoomState['warnings']
  finalSound?: RoomState['finalSound']
}

function send(conn: Party.Connection, msg: ServerMessage): void {
  conn.send(JSON.stringify(msg))
}

function parseSeed(raw: string | null): CreateSeed {
  if (!raw) return {}
  try {
    // URL-safe base64 → JSON. Tolerant of either standard or url-safe.
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(normalized)
    const obj = JSON.parse(decoded) as unknown
    if (obj && typeof obj === 'object') return obj as CreateSeed
  } catch {
    // Malformed seed → silently fall back to defaults. Don't fail the
    // create; the client can fix its setup over a patch afterwards.
  }
  return {}
}

function buildInitialState(roomId: string, seed: CreateSeed): RoomState {
  const duration =
    typeof seed.duration === 'number' && seed.duration > 0
      ? Math.floor(seed.duration)
      : DEFAULT_DURATION_SEC
  return {
    roomId,
    hostToken: generateHostToken(),
    duration,
    endAtMs: null,
    pausedRemainSec: null,
    status: 'idle',
    repeat: typeof seed.repeat === 'boolean' ? seed.repeat : false,
    warnings: Array.isArray(seed.warnings) ? seed.warnings : DEFAULT_WARNINGS,
    finalSound: seed.finalSound ?? DEFAULT_FINAL_SOUND,
    activeHostConnId: null,
  }
}

/**
 * Validate a patch against the type-allowed shape. We trust the host
 * (URL access ⇒ host privilege), so this is structural sanity only —
 * not a security boundary. Returns a sanitized patch or `null` if the
 * payload is malformed beyond repair.
 */
function sanitizePatch(raw: unknown): RoomStatePatch | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const out: RoomStatePatch = {}

  if ('duration' in p) {
    const n = Number(p.duration)
    if (!Number.isFinite(n) || n <= 0) return null
    out.duration = Math.floor(n)
  }
  if ('endAtMs' in p) {
    if (p.endAtMs === null) {
      out.endAtMs = null
    } else {
      const n = Number(p.endAtMs)
      if (!Number.isFinite(n)) return null
      out.endAtMs = n
    }
  }
  if ('pausedRemainSec' in p) {
    if (p.pausedRemainSec === null) {
      out.pausedRemainSec = null
    } else {
      const n = Number(p.pausedRemainSec)
      if (!Number.isFinite(n) || n < 0) return null
      out.pausedRemainSec = n
    }
  }
  if ('status' in p) {
    const s = p.status
    if (s !== 'idle' && s !== 'running' && s !== 'paused' && s !== 'done')
      return null
    out.status = s
  }
  if ('repeat' in p) {
    if (typeof p.repeat !== 'boolean') return null
    out.repeat = p.repeat
  }
  if ('warnings' in p) {
    if (!Array.isArray(p.warnings)) return null
    // Trust the inner shape — host already validated client-side.
    out.warnings = p.warnings as RoomState['warnings']
  }
  if ('finalSound' in p) {
    if (typeof p.finalSound !== 'string') return null
    out.finalSound = p.finalSound as RoomState['finalSound']
  }

  return out
}

export default class TickleSyncServer implements Party.Server {
  // Cached in-memory copy of room state. Read once on first need from
  // DO storage; written back on every mutation. Storage is durable;
  // this field is just to avoid an `await` on every message.
  private state: RoomState | null = null

  constructor(readonly room: Party.Room) {}

  // Lazy load to keep cold-start hibernation cheap.
  private async loadState(): Promise<RoomState | null> {
    if (this.state) return this.state
    const stored = await this.room.storage.get<RoomState>(STATE_KEY)
    if (stored) this.state = stored
    return this.state
  }

  private async saveState(): Promise<void> {
    if (!this.state) return
    await this.room.storage.put(STATE_KEY, this.state)
  }

  private broadcastUpdate(): void {
    if (!this.state) return
    const payload: ServerMessage = {
      type: 'update',
      state: this.state,
      serverNow: Date.now(),
    }
    this.room.broadcast(JSON.stringify(payload))
  }

  async onConnect(
    conn: Party.Connection,
    ctx: Party.ConnectionContext,
  ): Promise<void> {
    // ConnectionContext.request.url has the full ws upgrade URL incl. query
    const url = new URL(ctx.request.url)
    const intent = url.searchParams.get('intent') // 'create' or null
    const hostToken = url.searchParams.get('host') // host reconnect

    const existing = await this.loadState()

    // ----- Case A: create new room -----
    if (intent === 'create') {
      if (existing) {
        // Caller picked a room id that already exists. Tell them so they
        // can retry with a fresh id; treat collision as a special case
        // of forbidden, but use a distinct code so the client knows to
        // regenerate vs. abort.
        send(conn, {
          type: 'error',
          code: 'forbidden',
          detail: 'room-already-exists',
        })
        conn.close()
        return
      }
      const seed = parseSeed(url.searchParams.get('seed'))
      this.state = buildInitialState(this.room.id, seed)
      this.state.activeHostConnId = conn.id
      await this.saveState()
      send(conn, {
        type: 'hydrate',
        state: this.state,
        serverNow: Date.now(),
      })
      return
    }

    // ----- Case B: room doesn't exist (viewer or host both lose) -----
    if (!existing) {
      send(conn, { type: 'error', code: 'room-not-found' })
      conn.close()
      return
    }

    // ----- Case C: host reconnect / new host tab -----
    if (hostToken) {
      if (hostToken !== existing.hostToken) {
        send(conn, { type: 'error', code: 'forbidden' })
        conn.close()
        return
      }
      // Kicked-flow: if there's already an active host conn (and it's
      // not us — same conn id won't happen but guard anyway), boot it.
      const prevHostId = existing.activeHostConnId
      if (prevHostId && prevHostId !== conn.id) {
        const prev = this.room.getConnection(prevHostId)
        if (prev) {
          send(prev, { type: 'kicked', reason: 'replaced' })
          prev.close()
        }
      }
      this.state = { ...existing, activeHostConnId: conn.id }
      await this.saveState()
      send(conn, {
        type: 'hydrate',
        state: this.state,
        serverNow: Date.now(),
      })
      return
    }

    // ----- Case D: viewer connect -----
    send(conn, {
      type: 'hydrate',
      state: existing,
      serverNow: Date.now(),
    })
  }

  async onMessage(message: string, sender: Party.Connection): Promise<void> {
    let parsed: ClientMessage
    try {
      parsed = JSON.parse(message) as ClientMessage
    } catch {
      send(sender, { type: 'error', code: 'bad-message' })
      return
    }

    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      send(sender, { type: 'error', code: 'bad-message' })
      return
    }

    // Ping/pong is open to anyone — viewers need clock offset too.
    if (parsed.type === 'ping') {
      const t2 = Date.now()
      const reply: ServerMessage = {
        type: 'pong',
        t1: parsed.t1,
        t2,
        // t3 is set just before the wire send. For our accuracy budget
        // (50ms target, network RTT swamps everything else) the gap
        // between t2 and t3 is sub-millisecond — use t2 if you want a
        // single measurement, but keep both fields per the protocol.
        t3: Date.now(),
      }
      send(sender, reply)
      return
    }

    if (parsed.type === 'patch') {
      const state = await this.loadState()
      if (!state) {
        send(sender, { type: 'error', code: 'room-not-found' })
        return
      }
      if (parsed.hostToken !== state.hostToken) {
        send(sender, { type: 'error', code: 'forbidden' })
        return
      }
      // Only the active host conn may write. Stale tabs that lost the
      // kicked race still hold a valid token but their conn id is no
      // longer in `activeHostConnId` — ignore them.
      if (state.activeHostConnId !== sender.id) {
        send(sender, {
          type: 'error',
          code: 'forbidden',
          detail: 'not-active-host',
        })
        return
      }
      const clean = sanitizePatch(parsed.changes)
      if (!clean) {
        send(sender, { type: 'error', code: 'bad-message' })
        return
      }
      this.state = { ...state, ...clean }
      await this.saveState()
      this.broadcastUpdate()
      return
    }

    send(sender, { type: 'error', code: 'bad-message' })
  }

  async onClose(conn: Party.Connection): Promise<void> {
    const existing = await this.loadState()
    if (!existing) return
    if (existing.activeHostConnId === conn.id) {
      this.state = { ...existing, activeHostConnId: null }
      await this.saveState()
      // Don't broadcast activeHostConnId changes — viewers don't care
      // and we want to avoid noise. The next host connect will update
      // it without any visible side effect.
    }
  }
}

TickleSyncServer satisfies Party.Worker
