// QA-1 骨架（PartyKit Server 單元測試）
// 等 FE-2 完成、知道 server.ts 介面後搬到正式位置（party/tests/server.test.ts
// 或 tests/server/server.test.ts，取決於 vitest include 設定）。
//
// 這個檔案放在 tests/notes/ 避免被 vitest 收走，僅作 reference。
//
// 對應 spec.md 的 Requirements / Scenarios 對照見 tests/notes/room-sync-test-plan.md §2 表格。
import { describe, it, beforeEach } from 'vitest'

// TODO(FE-2 完成後)：
// import { TickleServer } from '../../party/server'
// import { FakeParty, FakeConnection } from '../helpers/fakeParty'

describe('PartyKit Server', () => {
  // TODO: let party: FakeParty
  // TODO: let server: TickleServer

  beforeEach(() => {
    // TODO: party = new FakeParty('test-room')
    // TODO: server = new TickleServer(party)
  })

  describe('Room 建立（Requirement: First-time visit auto-creates a room）', () => {
    it.todo('S1: 第一次連線 → onConnect 產生 roomId / hostToken / 預設 state 並寫入 storage')
    // setup:
    //   - new FakeConnection('c1') with URL query (no roomId / hostToken)
    //   - server.onConnect(conn, ctx)
    // assert:
    //   - party.storage.get('hostToken') matches /^ht_[A-Za-z0-9]{16}$/
    //   - party.storage.get('state') deep-equals 預設值 {duration: 300, repeat: false, warnings: [], finalSound: 'gong', status: 'idle', endAtMs: null}
    //   - conn.sent contains 'created' or 'hydrate' message including roomId + hostToken

    it.todo('S2: room ID 防撞 — 注入 ID 產生器、前 4 次與 storage 撞、第 5 次成功')
    // 需要 FE 把 ID generator 設成可注入。若 FE 不做注入：用 storage seed 已存在 4 個 known ID

    it.todo('S3: room ID 連 5 次都撞 → server 回 error / throw')
  })

  describe('Host token 驗證（Requirement: Host can write, viewer is read-only）', () => {
    it.todo('S4: hostToken 正確 → state 更新 + broadcast { type: "update", state, serverNow }')
    // setup:
    //   - server.onConnect(host)  // 取得 hostToken
    //   - host.onMessage(JSON.stringify({type:'patch', hostToken, changes:{status:'running', endAtMs: Date.now()+30000}}))
    // assert:
    //   - storage.state.status === 'running'
    //   - 所有 conn 的 sent 最後一筆 includes 'update' + serverNow

    it.todo('S5: hostToken 錯誤 → state 不變、回 { type: "error", code: "forbidden" }')
    // assert:
    //   - storage.state 不變
    //   - 該 conn 收到 forbidden、其他 conn 沒收到任何 update

    it.todo('Viewer client 不能送 patch（即使有 hostToken field 是空字串/null）')
  })

  describe('Broadcast / Hydrate（Requirement: Server is authoritative）', () => {
    it.todo('S6: patch 後所有 conn（包含 host 自己？確認設計）都收到 update')
    // 注意：design.md / spec.md 沒明確說 sender 是否 echo。預設「不 exclude sender」（含 host）

    it.todo('S7: 新 viewer 連線 → 立刻收到 { type: "hydrate", state, serverNow }')
    // setup:
    //   - server.onConnect(host)
    //   - host 送 patch 把 state 改為 running
    //   - server.onConnect(viewer)
    // assert:
    //   - viewer.sent[0] is { type: 'hydrate', state: { status: 'running', ... }, serverNow: number }
    //   - serverNow ≈ Date.now()（vi.setSystemTime 確認）
  })

  describe('Ping / Pong（Requirement: Server is authoritative — clock offset）', () => {
    it.todo('S8: 收 { type: "ping", t1 } → 回 { type: "pong", t1, t2, t3 }，且 t2 ≤ t3')
    // setup:
    //   - vi.useFakeTimers + vi.setSystemTime
    //   - server.onConnect(conn)
    //   - vi.setSystemTime(1000); conn.onMessage(JSON.stringify({type:'ping', t1: 999}))
    // assert:
    //   - 收到 pong with t1=999, t2>=1000, t3>=t2
  })

  describe('Kicked 流程（Requirement: Only one active host connection per room）', () => {
    it.todo('S9: Host A 已連、Host B 同 token 連上 → A 收到 kicked + close、activeHostConnId=B')
    // setup:
    //   - hostA = server.onConnect with hostToken
    //   - hostB = server.onConnect with 同 hostToken
    // assert:
    //   - hostA.sent 含 { type: 'kicked', reason: 'replaced' }
    //   - hostA.closed === true
    //   - hostB 正常無 kicked

    it.todo('S11: onClose 把 activeHostConnId 設回 null（reload 不誤觸 kick）')
    // setup:
    //   - hostA connect → close
    //   - hostC 再連 with 同 token
    // assert:
    //   - hostC 不會收到 kicked（因為 activeHostConnId 已 null）

    it.todo('S12: viewer 連線不影響 activeHostConnId')
    // setup:
    //   - hostA connect → activeHostConnId=hostA
    //   - viewer connect（不帶 hostToken）
    // assert:
    //   - 內部 activeHostConnId 仍是 hostA
    //   - hostA 沒收到 kicked
  })

  describe('Room-not-found（Requirement: Nonexistent room shows guidance）', () => {
    it.todo('S10: viewer 連到 storage 沒 state 的 room → 回 { type: "error", code: "room-not-found" }、close conn')
    // setup:
    //   - party = new FakeParty('zzzzzz')（storage 空）
    //   - server = new TickleServer(party)
    //   - viewer = server.onConnect(...)
    // assert:
    //   - viewer.sent 含 { type: 'error', code: 'room-not-found' }
    //   - 視設計可能 close conn
  })
})
