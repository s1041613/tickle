/**
 * TickleSyncServer unit tests (QA-1).
 *
 * Covers the per-room behaviour of party/server.ts:
 *   - onConnect: create / host-reconnect / viewer / room-not-found / kicked
 *   - onMessage: ping/pong, patch with token validation, bad-message
 *   - onClose: clears activeHostConnId without broadcasting
 *
 * We exercise the real server class against in-memory fakes for
 * `Party.Room` and `Party.Connection` (see tests/server/fakeRoom.ts).
 * This bypasses the WebSocket / Durable Object runtime entirely, which
 * is appropriate because the server's logic is pure orchestration of
 * storage + broadcast — both faithfully reproducible.
 *
 * Test-ID prefix `S*` matches tests/notes/room-sync-test-plan.md §2.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import TickleSyncServer from '../../party/server'
import type { RoomState, ServerMessage } from '../../party/types'
import {
  DEFAULT_DURATION_SEC,
  DEFAULT_FINAL_SOUND,
  DEFAULT_WARNINGS,
} from '../../party/types'
import {
  FakeRoom,
  FakeConnection,
  asRoom,
  asConnection,
  makeCtx,
} from './fakeRoom'

const STATE_KEY = 'state'

/**
 * Setup: bring up a fresh `TickleSyncServer` bound to a fresh `FakeRoom`.
 * Tests then drive it by calling onConnect/onMessage/onClose directly.
 */
function newServer(roomId = 'abc123'): { room: FakeRoom; server: TickleSyncServer } {
  const room = new FakeRoom(roomId)
  const server = new TickleSyncServer(asRoom(room))
  return { room, server }
}

/**
 * Helper: register a connection in the FakeRoom (so broadcast/getConnection
 * find it) and call onConnect with the given query. Returns the conn so
 * tests can introspect `sent` / `closed`.
 */
async function connect(
  server: TickleSyncServer,
  room: FakeRoom,
  connId: string,
  query: Record<string, string> = {},
): Promise<FakeConnection> {
  const conn = new FakeConnection(connId)
  room.register(conn)
  await server.onConnect(asConnection(conn), makeCtx(query))
  return conn
}

/** Type-narrowed access to stored state via the FakeStorage. */
async function readState(room: FakeRoom): Promise<RoomState | undefined> {
  return room.storage.get<RoomState>(STATE_KEY)
}

describe('TickleSyncServer.onConnect', () => {
  beforeEach(() => {
    // Server records `Date.now()` in `serverNow` fields — pin the clock
    // so assertions can be exact rather than within-an-epsilon.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-25T12:00:00Z'))
  })

  describe('intent=create (Room 建立)', () => {
    it('S1: intent=create with empty storage → writes initial state and hydrates the host', async () => {
      const { room, server } = newServer('newroom')
      const conn = await connect(server, room, 'c1', { intent: 'create' })

      // Storage should now hold the initial state, with this conn as active host.
      const state = await readState(room)
      expect(state).toBeDefined()
      expect(state!.roomId).toBe('newroom')
      expect(state!.hostToken).toMatch(/^ht_[a-z0-9]{16}$/)
      expect(state!.duration).toBe(DEFAULT_DURATION_SEC)
      expect(state!.warnings).toEqual(DEFAULT_WARNINGS)
      expect(state!.finalSound).toBe(DEFAULT_FINAL_SOUND)
      expect(state!.status).toBe('idle')
      expect(state!.endAtMs).toBeNull()
      expect(state!.activeHostConnId).toBe('c1')

      // The host should have received hydrate including the state and serverNow.
      const msg = conn.lastMessage()
      expect(msg.type).toBe('hydrate')
      if (msg.type !== 'hydrate') throw new Error('unreachable')
      expect(msg.state).toEqual(state)
      expect(msg.serverNow).toBe(Date.now())

      // Not closed.
      expect(conn.closed).toBe(false)
    })

    it("S1b: intent=create honours seed (duration/repeat/warnings/finalSound)", async () => {
      // Base64-encoded JSON seed, matching the format the client uses
      // when migrating legacy URL params into a fresh room.
      const seedObj = {
        duration: 600,
        repeat: true,
        warnings: [{ id: 1, at: 30, color: 'red', sound: 'gong' }],
        finalSound: 'drumGong',
      }
      const seed = btoa(JSON.stringify(seedObj))
      const { room, server } = newServer('seeded')
      await connect(server, room, 'c1', { intent: 'create', seed })

      const state = await readState(room)
      expect(state!.duration).toBe(600)
      expect(state!.repeat).toBe(true)
      expect(state!.warnings).toEqual(seedObj.warnings)
      expect(state!.finalSound).toBe('drumGong')
    })

    it("S1c: intent=create with malformed seed silently falls back to defaults", async () => {
      const { room, server } = newServer('seeded')
      await connect(server, room, 'c1', { intent: 'create', seed: '!!not-base64!!' })

      const state = await readState(room)
      expect(state!.duration).toBe(DEFAULT_DURATION_SEC)
      expect(state!.warnings).toEqual(DEFAULT_WARNINGS)
      // The connection should still be hydrated successfully, not errored.
      const msg = (room.connections.get('c1')!).lastMessage()
      expect(msg.type).toBe('hydrate')
    })

    it("S2': intent=create on an already-existing room → error room-already-exists + close", async () => {
      // Seed an existing state to simulate the client picking a colliding id.
      const { room, server } = newServer('taken')
      room.storage.seed<RoomState>(STATE_KEY, {
        roomId: 'taken',
        hostToken: 'ht_existingxxxxxxx',
        duration: 120,
        endAtMs: null,
        pausedRemainSec: null,
        status: 'idle',
        repeat: false,
        warnings: DEFAULT_WARNINGS,
        finalSound: DEFAULT_FINAL_SOUND,
        activeHostConnId: null,
      })

      const conn = await connect(server, room, 'c1', { intent: 'create' })

      const msg = conn.lastMessage()
      expect(msg.type).toBe('error')
      if (msg.type !== 'error') throw new Error('unreachable')
      expect(msg.code).toBe('forbidden')
      expect(msg.detail).toBe('room-already-exists')
      expect(conn.closed).toBe(true)

      // Storage MUST be untouched — we did not overwrite the existing room.
      const state = await readState(room)
      expect(state!.hostToken).toBe('ht_existingxxxxxxx')
      expect(state!.duration).toBe(120)
    })
  })

  describe('host reconnect / second host (Kicked 流程)', () => {
    it('S4-pre: host reconnect with correct token → becomes activeHostConn + hydrate', async () => {
      // First create the room to get a real hostToken.
      const { room, server } = newServer()
      const host1 = await connect(server, room, 'h1', { intent: 'create' })
      const hostToken = (await readState(room))!.hostToken
      // Simulate host1 disconnecting + a new host tab reconnecting with the token.
      await server.onClose(asConnection(host1))
      room.unregister(host1)

      const host2 = await connect(server, room, 'h2', { host: hostToken })

      const state = await readState(room)
      expect(state!.activeHostConnId).toBe('h2')

      const msg = host2.lastMessage()
      expect(msg.type).toBe('hydrate')
      expect(host2.closed).toBe(false)
    })

    it('S5: host reconnect with wrong token → error forbidden + close + storage untouched', async () => {
      const { room, server } = newServer()
      await connect(server, room, 'h1', { intent: 'create' })
      const stateBefore = await readState(room)

      const intruder = await connect(server, room, 'attacker', { host: 'ht_wrongxxxxxxxxxxxx' })

      const msg = intruder.lastMessage()
      expect(msg.type).toBe('error')
      if (msg.type !== 'error') throw new Error('unreachable')
      expect(msg.code).toBe('forbidden')
      expect(intruder.closed).toBe(true)

      const stateAfter = await readState(room)
      expect(stateAfter!.hostToken).toBe(stateBefore!.hostToken)
      expect(stateAfter!.activeHostConnId).toBe('h1') // unchanged
    })

    it('S9: second host with valid token → first host receives kicked + close, second becomes active', async () => {
      const { room, server } = newServer()
      const host1 = await connect(server, room, 'h1', { intent: 'create' })
      const hostToken = (await readState(room))!.hostToken

      // Second tab opens — host1 is still in `room.connections` (not closed yet from its side)
      const host2 = await connect(server, room, 'h2', { host: hostToken })

      // host1 should have been sent kicked then closed by the server.
      const kicked = host1
        .receivedMessages()
        .find((m): m is Extract<ServerMessage, { type: 'kicked' }> => m.type === 'kicked')
      expect(kicked).toBeDefined()
      expect(kicked!.reason).toBe('replaced')
      expect(host1.closed).toBe(true)

      // host2 should have been hydrated and is now activeHostConnId.
      expect(host2.lastMessage().type).toBe('hydrate')
      expect(host2.closed).toBe(false)
      expect((await readState(room))!.activeHostConnId).toBe('h2')
    })
  })

  describe('viewer connect', () => {
    it('S7: viewer connects to an existing room → receives hydrate, no activeHostConnId change', async () => {
      const { room, server } = newServer()
      const host = await connect(server, room, 'h1', { intent: 'create' })
      const stateBefore = await readState(room)

      const viewer = await connect(server, room, 'v1') // no intent, no host

      // Viewer got hydrate with the same state.
      const msg = viewer.lastMessage()
      expect(msg.type).toBe('hydrate')
      if (msg.type !== 'hydrate') throw new Error('unreachable')
      expect(msg.state.roomId).toBe(stateBefore!.roomId)

      // S12-flavour: viewer didn't displace the host.
      const stateAfter = await readState(room)
      expect(stateAfter!.activeHostConnId).toBe('h1')
      // Host did NOT receive any kicked message.
      expect(host.receivedMessages().some((m) => m.type === 'kicked')).toBe(false)
      expect(host.closed).toBe(false)
    })

    it('S10: viewer connects to a non-existent room → error room-not-found + close', async () => {
      const { room, server } = newServer('ghost') // storage intentionally empty
      const viewer = await connect(server, room, 'v1')

      const msg = viewer.lastMessage()
      expect(msg.type).toBe('error')
      if (msg.type !== 'error') throw new Error('unreachable')
      expect(msg.code).toBe('room-not-found')
      expect(viewer.closed).toBe(true)

      // Storage stays empty.
      const state = await readState(room)
      expect(state).toBeUndefined()
    })
  })
})

describe('TickleSyncServer.onMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-25T12:00:00Z'))
  })

  describe('ping/pong', () => {
    it('S8: ping(t1) → pong(t1, t2, t3) with t2 ≤ t3', async () => {
      const { room, server } = newServer()
      const conn = await connect(server, room, 'c1', { intent: 'create' })

      // Move the clock forward so t2 > t1, then send a ping.
      vi.advanceTimersByTime(50)
      const t1 = Date.now() - 100 // pretend client sent ping 100ms ago
      await server.onMessage(JSON.stringify({ type: 'ping', t1 }), asConnection(conn))

      const reply = conn.lastMessage()
      expect(reply.type).toBe('pong')
      if (reply.type !== 'pong') throw new Error('unreachable')
      expect(reply.t1).toBe(t1)
      expect(reply.t2).toBe(Date.now())
      expect(reply.t3).toBeGreaterThanOrEqual(reply.t2)
    })
  })

  describe('patch with host-token validation', () => {
    it('S4: valid hostToken + active host → state mutates, all conns receive update', async () => {
      const { room, server } = newServer()
      const host = await connect(server, room, 'h1', { intent: 'create' })
      const viewer = await connect(server, room, 'v1')
      const hostToken = (await readState(room))!.hostToken

      const changes = { status: 'running' as const, endAtMs: Date.now() + 30_000 }
      await server.onMessage(
        JSON.stringify({ type: 'patch', hostToken, changes }),
        asConnection(host),
      )

      // State mutated.
      const state = await readState(room)
      expect(state!.status).toBe('running')
      expect(state!.endAtMs).toBe(changes.endAtMs)

      // Both host AND viewer received an `update` (sender is NOT excluded).
      const hostUpdate = host
        .receivedMessages()
        .find((m): m is Extract<ServerMessage, { type: 'update' }> => m.type === 'update')
      const viewerUpdate = viewer
        .receivedMessages()
        .find((m): m is Extract<ServerMessage, { type: 'update' }> => m.type === 'update')
      expect(hostUpdate).toBeDefined()
      expect(viewerUpdate).toBeDefined()
      expect(hostUpdate!.state.status).toBe('running')
      expect(hostUpdate!.serverNow).toBe(Date.now())
    })

    it('S5: patch with wrong hostToken → error forbidden, state untouched, no broadcast', async () => {
      const { room, server } = newServer()
      const host = await connect(server, room, 'h1', { intent: 'create' })
      const viewer = await connect(server, room, 'v1')
      const stateBefore = await readState(room)

      await server.onMessage(
        JSON.stringify({
          type: 'patch',
          hostToken: 'ht_wrongxxxxxxxxxxxx',
          changes: { duration: 9999 },
        }),
        asConnection(host),
      )

      // State untouched.
      const stateAfter = await readState(room)
      expect(stateAfter).toEqual(stateBefore)

      // The host (who sent the bad patch) got an error.
      const errMsg = host
        .receivedMessages()
        .find((m): m is Extract<ServerMessage, { type: 'error' }> => m.type === 'error')
      expect(errMsg).toBeDefined()
      expect(errMsg!.code).toBe('forbidden')

      // Viewer never received update.
      expect(viewer.receivedMessages().some((m) => m.type === 'update')).toBe(false)
    })

    it("S5b: patch from a stale-host conn (valid token but not activeHostConnId) → forbidden detail=not-active-host", async () => {
      const { room, server } = newServer()
      const host1 = await connect(server, room, 'h1', { intent: 'create' })
      const hostToken = (await readState(room))!.hostToken
      // Second host replaces host1 (kicked flow).
      await connect(server, room, 'h2', { host: hostToken })
      // host1 is closed but still our test object — attempt to patch anyway
      // (simulates a stale tab that didn't process its `kicked` yet).
      // Wipe out host1's previous messages to focus on the new error.
      host1.sent.length = 0

      await server.onMessage(
        JSON.stringify({
          type: 'patch',
          hostToken,
          changes: { duration: 42 },
        }),
        asConnection(host1),
      )

      const msg = host1.lastMessage()
      expect(msg.type).toBe('error')
      if (msg.type !== 'error') throw new Error('unreachable')
      expect(msg.code).toBe('forbidden')
      expect(msg.detail).toBe('not-active-host')

      // State unchanged.
      const state = await readState(room)
      expect(state!.duration).not.toBe(42)
    })

    it('S4b: patch with invalid changes payload (bad type) → bad-message, no state change', async () => {
      const { room, server } = newServer()
      const host = await connect(server, room, 'h1', { intent: 'create' })
      const hostToken = (await readState(room))!.hostToken
      const stateBefore = await readState(room)
      host.sent.length = 0

      await server.onMessage(
        JSON.stringify({
          type: 'patch',
          hostToken,
          // status='banana' is not in the allowed enum → sanitizePatch returns null
          changes: { status: 'banana' },
        }),
        asConnection(host),
      )

      const msg = host.lastMessage()
      expect(msg.type).toBe('error')
      if (msg.type !== 'error') throw new Error('unreachable')
      expect(msg.code).toBe('bad-message')

      const stateAfter = await readState(room)
      expect(stateAfter).toEqual(stateBefore)
    })
  })

  describe('malformed messages', () => {
    it('S12a: non-JSON message → bad-message error', async () => {
      const { room, server } = newServer()
      const conn = await connect(server, room, 'c1', { intent: 'create' })
      conn.sent.length = 0

      await server.onMessage('this is not json', asConnection(conn))

      const msg = conn.lastMessage()
      expect(msg.type).toBe('error')
      if (msg.type !== 'error') throw new Error('unreachable')
      expect(msg.code).toBe('bad-message')
    })

    it('S12b: unknown message type → bad-message error', async () => {
      const { room, server } = newServer()
      const conn = await connect(server, room, 'c1', { intent: 'create' })
      conn.sent.length = 0

      await server.onMessage(
        JSON.stringify({ type: 'mystery', payload: 'whatever' }),
        asConnection(conn),
      )

      const msg = conn.lastMessage()
      expect(msg.type).toBe('error')
      if (msg.type !== 'error') throw new Error('unreachable')
      expect(msg.code).toBe('bad-message')
    })

    it('S12c: patch on a room with empty storage → room-not-found error', async () => {
      const { room, server } = newServer('ghost')
      // Don't run intent=create; jump straight to a patch.
      // We still need a registered conn to act as sender.
      const conn = new FakeConnection('c1')
      room.register(conn)

      await server.onMessage(
        JSON.stringify({
          type: 'patch',
          hostToken: 'ht_xxxxxxxxxxxxxxxx',
          changes: { duration: 100 },
        }),
        asConnection(conn),
      )

      const msg = conn.lastMessage()
      expect(msg.type).toBe('error')
      if (msg.type !== 'error') throw new Error('unreachable')
      expect(msg.code).toBe('room-not-found')
    })
  })
})

describe('TickleSyncServer.onClose', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-25T12:00:00Z'))
  })

  it('S11: closing the active host conn clears activeHostConnId in storage', async () => {
    const { room, server } = newServer()
    const host = await connect(server, room, 'h1', { intent: 'create' })
    expect((await readState(room))!.activeHostConnId).toBe('h1')

    await server.onClose(asConnection(host))
    room.unregister(host)

    expect((await readState(room))!.activeHostConnId).toBeNull()
  })

  it('S11b: after onClose, a fresh host with the same token does not get kicked', async () => {
    const { room, server } = newServer()
    const host1 = await connect(server, room, 'h1', { intent: 'create' })
    const hostToken = (await readState(room))!.hostToken
    await server.onClose(asConnection(host1))
    room.unregister(host1)

    const host2 = await connect(server, room, 'h2', { host: hostToken })

    // The new host got hydrated, not kicked.
    expect(host2.lastMessage().type).toBe('hydrate')
    expect(host2.closed).toBe(false)
    expect((await readState(room))!.activeHostConnId).toBe('h2')
  })

  it('S11c: closing a viewer conn does NOT touch activeHostConnId', async () => {
    const { room, server } = newServer()
    await connect(server, room, 'h1', { intent: 'create' })
    const viewer = await connect(server, room, 'v1')
    expect((await readState(room))!.activeHostConnId).toBe('h1')

    await server.onClose(asConnection(viewer))
    room.unregister(viewer)

    expect((await readState(room))!.activeHostConnId).toBe('h1')
  })
})
