/**
 * Fake PartyKit runtime helpers for unit-testing TickleSyncServer.
 *
 * We bypass the real PartyKit / Cloudflare runtime entirely and inject
 * lightweight stand-ins for:
 *   - `Party.Room` (only the fields server.ts actually touches: id, storage, broadcast, getConnection)
 *   - `Party.Connection` (id, send, close — recorded so tests can assert)
 *   - `Party.ConnectionContext` (request — only `url` is read)
 *   - DO storage (in-memory Map-backed)
 *
 * Server uses `Party.Room.storage.get<T>(key)` and `.put(key, value)` —
 * both async returning Promises that resolve immediately here.
 *
 * Each fake exposes `sent` / `closed` / `closeReason` so test assertions
 * can introspect what the server tried to send / close.
 */
import type * as Party from 'partykit/server'
import type { ServerMessage } from '../../party/types'

export class FakeStorage {
  private kv = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | undefined> {
    return this.kv.get(key) as T | undefined
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.kv.set(key, value)
  }

  async delete(key: string): Promise<boolean> {
    return this.kv.delete(key)
  }

  // Direct seed for "room already exists" scenarios — bypasses server.
  seed<T>(key: string, value: T): void {
    this.kv.set(key, value)
  }
}

export class FakeConnection {
  readonly id: string
  /** Every `conn.send(...)` payload, in order. Test asserts on this. */
  readonly sent: string[] = []
  closed = false
  closeCode?: number
  closeReason?: string

  constructor(id: string) {
    this.id = id
  }

  send(msg: string): void {
    this.sent.push(msg)
  }

  close(code?: number, reason?: string): void {
    this.closed = true
    this.closeCode = code
    this.closeReason = reason
  }

  /** Parse `sent` payloads back into ServerMessage objects for ergonomic asserts. */
  receivedMessages(): ServerMessage[] {
    return this.sent.map((s) => JSON.parse(s) as ServerMessage)
  }

  /** Convenience: last message received, parsed. Throws if none. */
  lastMessage(): ServerMessage {
    if (this.sent.length === 0) throw new Error('no messages received')
    return JSON.parse(this.sent[this.sent.length - 1]) as ServerMessage
  }
}

export class FakeRoom {
  readonly id: string
  readonly storage = new FakeStorage()
  /** Live connection map, mirrors what PartyKit runtime would keep. */
  readonly connections = new Map<string, FakeConnection>()

  constructor(id: string) {
    this.id = id
  }

  broadcast(msg: string, without?: string[]): void {
    for (const [connId, conn] of this.connections) {
      if (without && without.includes(connId)) continue
      conn.send(msg)
    }
  }

  getConnection(id: string): FakeConnection | undefined {
    return this.connections.get(id)
  }

  /** Test helper: register a connection so broadcast/getConnection finds it. */
  register(conn: FakeConnection): void {
    this.connections.set(conn.id, conn)
  }

  /** Test helper: simulate the runtime tearing a closed conn off the map. */
  unregister(conn: FakeConnection): void {
    this.connections.delete(conn.id)
  }
}

/**
 * Build a `Party.ConnectionContext` with a request whose URL carries
 * the query params the server cares about (`intent`, `host`, `seed`).
 *
 * Server only reads `ctx.request.url` and constructs `new URL(...)` —
 * so we just need an object with a string `url`. Cast through unknown
 * to keep TypeScript happy without dragging in @cloudflare/workers-types.
 */
export function makeCtx(query: Record<string, string> = {}): Party.ConnectionContext {
  const params = new URLSearchParams(query).toString()
  const url = `https://example.partykit.dev/parties/main/room?${params}`
  return {
    request: { url } as unknown as Party.ConnectionContext['request'],
  }
}

/**
 * Cast helpers — server.ts is typed against the real `Party.Room` /
 * `Party.Connection`. Our fakes implement the subset that server.ts
 * actually exercises. Centralising these casts here keeps each test
 * one-liner clean.
 */
export function asRoom(room: FakeRoom): Party.Room {
  return room as unknown as Party.Room
}
export function asConnection(conn: FakeConnection): Party.Connection {
  return conn as unknown as Party.Connection
}
