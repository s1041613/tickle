// QA-2 骨架（useRoomSync composable 單元測試）
// 等 FE-3 完成、知道 composable 介面後搬到 tests/composables/useRoomSync.test.ts
//
// 此檔放 tests/notes/ 避免被 vitest 收走、僅作 reference。
//
// 對應 spec.md Requirements / Scenarios 對照見 tests/notes/room-sync-test-plan.md §2 表格 C1-C9。
import { describe, it, beforeEach, afterEach } from 'vitest'

// TODO(FE-3 完成後)：
// import { vi, expect } from 'vitest'
// import { effectScope, nextTick, type EffectScope } from 'vue'
// import { useRoomSync } from '../../src/composables/useRoomSync'
//
// vi.mock('partysocket', () => {
//   // FakePartySocket：暴露 simulateMessage / simulateClose / sent / readyState
//   // 模板：
//   //   class FakePartySocket extends EventTarget {
//   //     readyState = 0
//   //     sent: string[] = []
//   //     send(msg: string) { this.sent.push(msg) }
//   //     close() { this.dispatchEvent(new Event('close')) }
//   //     simulateOpen() { this.readyState = 1; this.dispatchEvent(new Event('open')) }
//   //     simulateMessage(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })) }
//   //   }
//   //   return { default: FakePartySocket }
// })

describe('useRoomSync', () => {
  // TODO: let scope: EffectScope
  // TODO: let socket: FakePartySocket  // 從 vi.mocked(...) 抓出來的最後一個 instance

  beforeEach(() => {
    // TODO: vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
    // TODO: scope = effectScope()
  })

  afterEach(() => {
    // TODO: scope.stop()
    // TODO: vi.useRealTimers()
  })

  describe('Connect / Hydrate（Requirement: Server is authoritative — Hydrate on connect）', () => {
    it.todo('C1: simulate hydrate message → roomState ref 反映 server state')
    // setup:
    //   - scope.run(() => useRoomSync({ roomId: 'abc', hostToken: null }))
    //   - socket.simulateOpen()
    //   - socket.simulateMessage({ type: 'hydrate', state: { status: 'running', endAtMs: 12345, duration: 300, ... }, serverNow: 1000 })
    // assert:
    //   - sync.roomState.value matches the hydrated state
    //   - sync.connected.value === true
  })

  describe('Clock offset（Requirement: Server is authoritative — clock offset 校正）', () => {
    it.todo('C2: 連線後送 3 個 ping，收到 3 個 pong 後 clockOffset = 3 個 sample 的中位數')
    // setup:
    //   - vi.setSystemTime(1000); 連線
    //   - 觸發 3 次 ping（可能由 timer 或 connect 後立即送）
    //   - 對每個 ping 模擬 pong with controlled t2 / t3 → offset 樣本 [-50, +10, +30]
    // assert:
    //   - clockOffset.value === 10（median）

    it.todo('C2b: clock offset 樣本方差過大（> 500ms）→ 觸發 onClockSkewWarning（若 design 採用）')
  })

  describe('Patch / Update（Requirement: Host can write, viewer is read-only）', () => {
    it.todo('C3: host 呼叫 sendPatch → socket.send 收到 { type:"patch", hostToken, changes }')
    // setup:
    //   - useRoomSync({ roomId: 'abc', hostToken: 'ht_test123' })
    //   - socket.simulateOpen() + 確認連上
    //   - sync.sendPatch({ duration: 600 })
    // assert:
    //   - socket.sent 最後一筆 parsed === { type:'patch', hostToken: 'ht_test123', changes:{duration:600} }

    it.todo('C4: viewer（hostToken=null）呼叫 sendPatch → throw 或 no-op、socket 沒送 patch')

    it.todo('C5: simulate update message → roomState ref 被 Object.assign 套用 changes')
    // setup:
    //   - 預先 hydrate state = { status:'idle', duration:300 }
    //   - simulateMessage({ type:'update', changes:{ status:'running', endAtMs: 999 }, serverNow: 1000 })
    // assert:
    //   - roomState.value.status === 'running'
    //   - roomState.value.endAtMs === 999
    //   - roomState.value.duration === 300（未被 changes 覆蓋）
  })

  describe('Kicked（Requirement: Only one active host connection）', () => {
    it.todo('C6: simulate kicked → onKicked callback fired、isHost ref 設 false')
    // setup:
    //   - hostToken 不為 null 時連上
    //   - simulateMessage({ type:'kicked', reason:'replaced' })
    // assert:
    //   - onKicked callback 被呼叫過一次
    //   - sync.isHost.value === false
  })

  describe('Room-not-found（Requirement: Nonexistent room shows guidance）', () => {
    it.todo('C7: simulate { type:"error", code:"room-not-found" } → onRoomNotFound callback fired')
  })

  describe('Visibility re-sync（Requirement: Server is authoritative — Visibility 重新校正）', () => {
    it.todo('C8: document.visibilityState 從 hidden 變回 visible → 重新跑 ping + 重請 hydrate')
    // setup:
    //   - Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    //   - document.dispatchEvent(new Event('visibilitychange'))
    //   - ...切回 visible
    //   - document.dispatchEvent(new Event('visibilitychange'))
    // assert:
    //   - socket.sent 多了 3 個 ping
    //   - 或多了 1 個 { type: 'request-hydrate' }（看 design 決定）
  })

  describe('Reconnect（Requirement: Reconnect preserves running state）', () => {
    it.todo('C9: simulateClose + simulateOpen → 自動重請 hydrate / 重做 clock offset')
    // 我們不測 partysocket 的 reconnect 退避演算法，只測「重連後 useRoomSync 行為對」
  })
})
