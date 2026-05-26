/**
 * useRoomSync composable unit tests (QA-2).
 *
 * Tests cover:
 *   - Connection wiring (intent=create / host / viewer modes → socket query)
 *   - Hydrate → roomState ref reflects server state + onCreated fires for create mode
 *   - Clock offset: 3 ping samples → median computed on `clockOffset`
 *   - sendPatch host/viewer guarding
 *   - update messages mutate roomState
 *   - kicked → isHost flips false + onKicked callback
 *   - error: room-not-found → onRoomNotFound callback
 *   - error: forbidden + detail=room-already-exists → retry with new room id
 *   - visibilitychange→visible → re-measure clock offset
 *
 * We mock `partysocket` with a FakeSocket that lets tests drive
 * open/message/close events imperatively. The composable's reactive
 * refs let us assert what it did with each server message.
 *
 * Test-ID prefix `C*` matches tests/notes/room-sync-test-plan.md §2.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

// ---------- partysocket mock ----------
//
// `vi.mock(...)` is hoisted to the top of the file, so the factory
// cannot reference any module-scope identifiers. We define FakeSocket
// inside the factory and re-export it on a shared `globalThis` slot so
// tests can grab the constructor for typing / instance enumeration.

vi.mock('partysocket', () => {
  class FakeSocket extends EventTarget {
    static instances: FakeSocket[] = []
    static OPEN = 1 as const
    static CLOSED = 3 as const
    readonly OPEN = 1 as const
    readonly CLOSED = 3 as const
    readyState = 0
    sent: string[] = []
    closed = false
    constructor(public readonly opts: unknown) {
      super()
      FakeSocket.instances.push(this)
    }
    send(msg: string): void {
      this.sent.push(msg)
    }
    close(): void {
      this.closed = true
      this.readyState = this.CLOSED
      this.dispatchEvent(new Event('close'))
    }
    simulateOpen(): void {
      this.readyState = this.OPEN
      this.dispatchEvent(new Event('open'))
    }
    simulateMessage(payload: unknown): void {
      const data =
        typeof payload === 'string' ? payload : JSON.stringify(payload)
      this.dispatchEvent(new MessageEvent('message', { data }))
    }
    sentMessages<T = unknown>(): T[] {
      return this.sent.map((s) => JSON.parse(s) as T)
    }
  }
  // Expose for tests via globalThis (vi.mock factory can't return non-default exports either).
  ;(globalThis as unknown as { __FakeSocket: typeof FakeSocket }).__FakeSocket = FakeSocket
  return { default: FakeSocket }
})

import { useRoomSync, type UseRoomSyncOptions } from '../../src/composables/useRoomSync'

// Re-grab the FakeSocket class through the global slot the mock factory
// stashed. Typed loosely on purpose — tests assert shape, not class identity.
interface FakeSocketLike extends EventTarget {
  readonly opts: unknown
  readyState: number
  sent: string[]
  closed: boolean
  readonly OPEN: 1
  readonly CLOSED: 3
  send(msg: string): void
  close(): void
  simulateOpen(): void
  simulateMessage(payload: unknown): void
  sentMessages<T = unknown>(): T[]
}
interface FakeSocketCtor {
  new (opts: unknown): FakeSocketLike
  instances: FakeSocketLike[]
}
const FakeSocket = (globalThis as unknown as { __FakeSocket: FakeSocketCtor })
  .__FakeSocket

// Helper: window/document don't exist in node-only mode; jsdom provides
// them. Reset any visibility state mutation between tests.
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  })
}

interface Harness {
  scope: EffectScope
  sync: ReturnType<typeof useRoomSync>
  socket: FakeSocketLike
}

function setup(overrides: Partial<UseRoomSyncOptions> = {}): Harness {
  // Default: viewer mode (simplest). Tests override `mode` as needed.
  const defaults: UseRoomSyncOptions = {
    mode: { kind: 'viewer', roomId: 'abc123' },
  }
  const options: UseRoomSyncOptions = { ...defaults, ...overrides }

  const scope = effectScope()
  let sync!: ReturnType<typeof useRoomSync>
  scope.run(() => {
    sync = useRoomSync(options)
  })
  // The composable constructs the socket synchronously in setup.
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1]
  return { scope, sync, socket }
}

beforeEach(() => {
  FakeSocket.instances = []
  setVisibility('visible')
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  })
  vi.setSystemTime(new Date('2026-05-25T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------- Tests ----------

describe('useRoomSync — connection wiring', () => {
  it('viewer mode → opens socket with no intent / no host query, isHost=false', () => {
    const h = setup({ mode: { kind: 'viewer', roomId: 'abc123' } })
    expect(h.sync.isHost.value).toBe(false)
    expect((h.socket.opts as { room: string }).room).toBe('abc123')
    expect((h.socket.opts as { query: Record<string, string> }).query).toEqual({})
    h.scope.stop()
  })

  it('host mode → opens socket with host token, isHost=true', () => {
    const h = setup({
      mode: { kind: 'host', roomId: 'abc123', hostToken: 'ht_xxxxxxxxxxxxxxxx' },
    })
    expect(h.sync.isHost.value).toBe(true)
    expect((h.socket.opts as { query: Record<string, string> }).query).toEqual({
      host: 'ht_xxxxxxxxxxxxxxxx',
    })
    h.scope.stop()
  })

  it('create mode → opens socket with intent=create + random 6-char room id', () => {
    const h = setup({ mode: { kind: 'create' } })
    expect(h.sync.isHost.value).toBe(true)
    const room = (h.socket.opts as { room: string }).room
    expect(room).toMatch(/^[a-z2-9]{6}$/) // 31-char alphabet
    expect((h.socket.opts as { query: Record<string, string> }).query.intent).toBe('create')
    h.scope.stop()
  })

  it('create mode with seed → URL-safe base64 seed in query', () => {
    const h = setup({
      mode: {
        kind: 'create',
        seed: { duration: 120, warnings: [{ id: 1, at: 30, color: 'red', sound: 'gong' }] },
      },
    })
    const query = (h.socket.opts as { query: Record<string, string> }).query
    expect(query.intent).toBe('create')
    expect(query.seed).toBeDefined()
    // URL-safe base64: no '+', '/', or '='
    expect(query.seed).not.toMatch(/[+/=]/)
    // Round-trip decode (atob can read URL-safe after we flip back).
    const decoded = JSON.parse(
      atob(query.seed.replace(/-/g, '+').replace(/_/g, '/')),
    )
    expect(decoded.duration).toBe(120)
    h.scope.stop()
  })
})

describe('useRoomSync — hydrate / update (C1, C5)', () => {
  const baseState = {
    roomId: 'abc123',
    hostToken: 'ht_xxxxxxxxxxxxxxxx',
    duration: 300,
    endAtMs: null,
    pausedRemainSec: null,
    status: 'idle' as const,
    repeat: false,
    warnings: [],
    finalSound: 'gong' as const,
    activeHostConnId: 'h1',
  }

  it('C1: hydrate message → roomState ref reflects server state', () => {
    const h = setup({ mode: { kind: 'viewer', roomId: 'abc123' } })
    h.socket.simulateOpen()
    h.socket.simulateMessage({
      type: 'hydrate',
      state: baseState,
      serverNow: Date.now(),
    })

    expect(h.sync.roomState.value).toEqual(baseState)
    expect(h.sync.isConnected.value).toBe(true)
    expect(h.sync.status.value).toBe('connected')
    h.scope.stop()
  })

  it('C1b: create-mode hydrate fires onCreated with the freshly-minted roomId/hostToken', () => {
    const onCreated = vi.fn()
    const h = setup({ mode: { kind: 'create' }, onCreated })
    h.socket.simulateOpen()
    h.socket.simulateMessage({
      type: 'hydrate',
      state: { ...baseState, roomId: 'newrm0', hostToken: 'ht_freshxxxxxxxx0' },
      serverNow: Date.now(),
    })

    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onCreated).toHaveBeenCalledWith({
      roomId: 'newrm0',
      hostToken: 'ht_freshxxxxxxxx0',
    })
    h.scope.stop()
  })

  it('C5: update message → roomState swaps to the new state object', () => {
    const h = setup({ mode: { kind: 'viewer', roomId: 'abc123' } })
    h.socket.simulateOpen()
    h.socket.simulateMessage({
      type: 'hydrate',
      state: baseState,
      serverNow: Date.now(),
    })
    const newEndAt = Date.now() + 30_000
    h.socket.simulateMessage({
      type: 'update',
      state: { ...baseState, status: 'running', endAtMs: newEndAt },
      serverNow: Date.now(),
    })

    expect(h.sync.roomState.value?.status).toBe('running')
    expect(h.sync.roomState.value?.endAtMs).toBe(newEndAt)
    h.scope.stop()
  })
})

describe('useRoomSync — clock offset (C2)', () => {
  it('C2: 3 ping samples → clockOffset becomes median of 3 computed offsets', async () => {
    const h = setup({ mode: { kind: 'viewer', roomId: 'abc123' } })
    h.socket.simulateOpen()
    // Hydrate triggers measureClockOffset() which schedules 3 pings at 0/30/60ms.
    h.socket.simulateMessage({
      type: 'hydrate',
      state: {
        roomId: 'abc123',
        hostToken: 'ht_xxxxxxxxxxxxxxxx',
        duration: 300,
        endAtMs: null,
        pausedRemainSec: null,
        status: 'idle',
        repeat: false,
        warnings: [],
        finalSound: 'gong',
        activeHostConnId: 'h1',
      },
      serverNow: Date.now(),
    })

    // Fire the staggered pings.
    vi.advanceTimersByTime(100)

    // Three ping messages should have been sent.
    type Ping = { type: 'ping'; t1: number }
    const pings: Ping[] = h.socket
      .sentMessages<Ping>()
      .filter((m: Ping) => m.type === 'ping')
    expect(pings.length).toBe(3)

    // Reply with controlled t2/t3 so we can predict the offsets.
    // Formula: offset = ((t2 - t1) + (t3 - t4)) / 2
    // We pick (t2, t3, t4) so each pong yields a known offset.
    //
    // Sample 1: offset = -50
    //   t1, t4 = Date.now() now (advanceTimersByTime has moved clock)
    //   Use simple symmetric values: (t2 - t1) = -50, (t3 - t4) = -50 → offset = -50
    const offsetsToInject = [-50, 30, 10] // median = 10
    // Process each pong in order with the current clock; we must advance
    // time minimally between to keep t4 deterministic. We'll snapshot
    // Date.now() per pong.
    pings.forEach((ping: Ping, idx: number) => {
      const target = offsetsToInject[idx]
      const t4 = Date.now()
      // Set both halves equal: t2 - t1 = target, t3 - t4 = target → mean = target
      const t2 = ping.t1 + target
      const t3 = t4 + target
      h.socket.simulateMessage({ type: 'pong', t1: ping.t1, t2, t3 })
    })

    // After 3 samples, clockOffset should be the median = 10.
    expect(h.sync.clockOffset.value).toBe(10)
    h.scope.stop()
  })
})

describe('useRoomSync — sendPatch (C3, C4)', () => {
  const seededState = {
    roomId: 'abc123',
    hostToken: 'ht_realtokenxxxxxx',
    duration: 300,
    endAtMs: null,
    pausedRemainSec: null,
    status: 'idle' as const,
    repeat: false,
    warnings: [],
    finalSound: 'gong' as const,
    activeHostConnId: 'h1',
  }

  it('C3: host sendPatch → socket.send carries { type:patch, hostToken, changes }', () => {
    const h = setup({
      mode: { kind: 'host', roomId: 'abc123', hostToken: 'ht_realtokenxxxxxx' },
    })
    h.socket.simulateOpen()
    h.socket.simulateMessage({
      type: 'hydrate',
      state: seededState,
      serverNow: Date.now(),
    })
    // Clear pings from the auto-measure.
    h.socket.sent.length = 0
    vi.advanceTimersByTime(100) // flush any scheduled pings
    h.socket.sent.length = 0

    const ok = h.sync.sendPatch({ duration: 600 })
    expect(ok).toBe(true)

    type Patch = { type: 'patch'; hostToken: string; changes: { duration: number } }
    const last = JSON.parse(h.socket.sent[h.socket.sent.length - 1]) as Patch
    expect(last.type).toBe('patch')
    expect(last.hostToken).toBe('ht_realtokenxxxxxx')
    expect(last.changes).toEqual({ duration: 600 })
    h.scope.stop()
  })

  it('C4: viewer sendPatch → returns false, no socket.send', () => {
    const h = setup({ mode: { kind: 'viewer', roomId: 'abc123' } })
    h.socket.simulateOpen()
    h.socket.simulateMessage({
      type: 'hydrate',
      state: seededState,
      serverNow: Date.now(),
    })
    vi.advanceTimersByTime(100)
    h.socket.sent.length = 0

    const ok = h.sync.sendPatch({ duration: 600 })
    expect(ok).toBe(false)

    // No patch message was sent (only allowed traffic from viewer is ping).
    type Msg = { type: string }
    const patches = h.socket
      .sentMessages<Msg>()
      .filter((m: Msg) => m.type === 'patch')
    expect(patches).toHaveLength(0)
    h.scope.stop()
  })

  it('C3b: host sendPatch before hydrate → false (no roomState yet, can\'t reach hostToken)', () => {
    const h = setup({
      mode: { kind: 'host', roomId: 'abc123', hostToken: 'ht_realtokenxxxxxx' },
    })
    h.socket.simulateOpen()
    // No hydrate yet.

    expect(h.sync.sendPatch({ duration: 600 })).toBe(false)
    h.scope.stop()
  })
})

describe('useRoomSync — kicked (C6)', () => {
  it('C6: kicked message → status="kicked", isHost flips false, onKicked called', () => {
    const onKicked = vi.fn()
    const h = setup({
      mode: { kind: 'host', roomId: 'abc123', hostToken: 'ht_realtokenxxxxxx' },
      onKicked,
    })
    h.socket.simulateOpen()
    h.socket.simulateMessage({
      type: 'hydrate',
      state: {
        roomId: 'abc123',
        hostToken: 'ht_realtokenxxxxxx',
        duration: 300,
        endAtMs: null,
        pausedRemainSec: null,
        status: 'idle',
        repeat: false,
        warnings: [],
        finalSound: 'gong',
        activeHostConnId: 'h1',
      },
      serverNow: Date.now(),
    })

    h.socket.simulateMessage({ type: 'kicked', reason: 'replaced' })

    expect(h.sync.status.value).toBe('kicked')
    expect(h.sync.isHost.value).toBe(false)
    expect(onKicked).toHaveBeenCalledTimes(1)
    expect(onKicked).toHaveBeenCalledWith('replaced')
    h.scope.stop()
  })
})

describe('useRoomSync — server errors (C7, create-collision)', () => {
  it('C7: error room-not-found → status flips, onRoomNotFound callback fires', () => {
    const onRoomNotFound = vi.fn()
    const h = setup({
      mode: { kind: 'viewer', roomId: 'ghost1' },
      onRoomNotFound,
    })
    h.socket.simulateOpen()
    h.socket.simulateMessage({ type: 'error', code: 'room-not-found' })

    expect(h.sync.status.value).toBe('room-not-found')
    expect(onRoomNotFound).toHaveBeenCalledTimes(1)
    h.scope.stop()
  })

  it('C7b: create-collision (forbidden + room-already-exists) → opens a new socket with a fresh room id', () => {
    const h = setup({ mode: { kind: 'create' } })
    const firstRoom = (h.socket.opts as { room: string }).room
    h.socket.simulateOpen()

    // Server says this room id was taken.
    h.socket.simulateMessage({
      type: 'error',
      code: 'forbidden',
      detail: 'room-already-exists',
    })

    // A new FakeSocket should have been constructed with a different room id.
    expect(FakeSocket.instances.length).toBe(2)
    const secondRoom = (FakeSocket.instances[1].opts as { room: string }).room
    expect(secondRoom).toMatch(/^[a-z2-9]{6}$/)
    expect(secondRoom).not.toBe(firstRoom)
    h.scope.stop()
  })

  it('C7c: bare forbidden (no detail) → status="forbidden", isHost false', () => {
    const h = setup({
      mode: { kind: 'host', roomId: 'abc123', hostToken: 'ht_wrongxxxxxxxxxxxx' },
    })
    h.socket.simulateOpen()
    h.socket.simulateMessage({ type: 'error', code: 'forbidden' })

    expect(h.sync.status.value).toBe('forbidden')
    expect(h.sync.isHost.value).toBe(false)
    h.scope.stop()
  })
})

describe('useRoomSync — visibility re-sync (C8)', () => {
  it('C8: tab visible while socket open → re-measure clock offset (new pings sent)', () => {
    const h = setup({ mode: { kind: 'viewer', roomId: 'abc123' } })
    h.socket.simulateOpen()
    // Hydrate fires an initial measureClockOffset(); flush those 3 pings out.
    h.socket.simulateMessage({
      type: 'hydrate',
      state: {
        roomId: 'abc123',
        hostToken: 'ht_xxxxxxxxxxxxxxxx',
        duration: 300,
        endAtMs: null,
        pausedRemainSec: null,
        status: 'idle',
        repeat: false,
        warnings: [],
        finalSound: 'gong',
        activeHostConnId: 'h1',
      },
      serverNow: Date.now(),
    })
    vi.advanceTimersByTime(100)
    h.socket.sent.length = 0

    // Simulate tab going hidden then visible.
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    // Pings are staggered with setTimeout; flush them.
    vi.advanceTimersByTime(100)

    type Ping = { type: 'ping'; t1: number }
    const pings: Ping[] = h.socket
      .sentMessages<Ping>()
      .filter((m: Ping) => m.type === 'ping')
    expect(pings.length).toBe(3)
    h.scope.stop()
  })

  it('C8b: visibilitychange to hidden does NOT trigger re-sync (only visible does)', () => {
    const h = setup({ mode: { kind: 'viewer', roomId: 'abc123' } })
    h.socket.simulateOpen()
    h.socket.simulateMessage({
      type: 'hydrate',
      state: {
        roomId: 'abc123',
        hostToken: 'ht_xxxxxxxxxxxxxxxx',
        duration: 300,
        endAtMs: null,
        pausedRemainSec: null,
        status: 'idle',
        repeat: false,
        warnings: [],
        finalSound: 'gong',
        activeHostConnId: 'h1',
      },
      serverNow: Date.now(),
    })
    vi.advanceTimersByTime(100)
    h.socket.sent.length = 0

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(100)

    expect(h.socket.sent).toHaveLength(0)
    h.scope.stop()
  })
})

describe('useRoomSync — close lifecycle', () => {
  it('socket close before terminal state → status="reconnecting", isConnected=false', () => {
    const h = setup({ mode: { kind: 'viewer', roomId: 'abc123' } })
    h.socket.simulateOpen()
    h.socket.close()

    expect(h.sync.isConnected.value).toBe(false)
    expect(h.sync.status.value).toBe('reconnecting')
    h.scope.stop()
  })

  it('socket close after kicked → stays in terminal state (no "reconnecting" override)', () => {
    const h = setup({
      mode: { kind: 'host', roomId: 'abc123', hostToken: 'ht_xxxxxxxxxxxxxxxx' },
      onKicked: () => {},
    })
    h.socket.simulateOpen()
    h.socket.simulateMessage({
      type: 'hydrate',
      state: {
        roomId: 'abc123',
        hostToken: 'ht_xxxxxxxxxxxxxxxx',
        duration: 300,
        endAtMs: null,
        pausedRemainSec: null,
        status: 'idle',
        repeat: false,
        warnings: [],
        finalSound: 'gong',
        activeHostConnId: 'h1',
      },
      serverNow: Date.now(),
    })
    h.socket.simulateMessage({ type: 'kicked', reason: 'replaced' })
    h.socket.close()

    expect(h.sync.status.value).toBe('kicked')
    h.scope.stop()
  })
})
