# Room Sync 測試計畫

> 作者：qa-engineer
> 目的：在 FE-2 / FE-3 / FE-5 完成前，把 server + composable + useTimer 擴充的測試策略想清楚，等被叫醒可以直接寫。
> 對應 OpenSpec change：`add-room-sync`

## 1. 測試 infra 選型

### 1.1 PartyKit server 測試（QA-1 / Task #4）

**結論：走純單元測試路線，不引入 Miniflare / partykit dev harness。**

理由：
- design.md 寫明 server 核心邏輯 ~30 行（room 建立 / token 驗證 / broadcast / kicked / hydrate / ping-pong）
- PartyKit `Server` class 是 vanilla TypeScript，建構子吃 `Party` 物件、方法吃 `Connection`
- 我們只要驗 server class 的 method 行為，不需要真的開 WebSocket / DO
- 走 Miniflare 路線會把測試啟動時間從 < 1s 推到 5s+，CI 不友善

**做法：**

寫一個 `tests/helpers/fakeParty.ts`（注意：放在 `tests/helpers/` 不是 `party/tests/`，因為我們不跑真 PartyKit runtime）：

```ts
// 提供 FakeParty / FakeConnection / FakeStorage，模擬 PartyKit runtime
class FakeStorage {
  private kv = new Map<string, unknown>()
  async get<T>(key: string) { return this.kv.get(key) as T | undefined }
  async put<T>(key: string, value: T) { this.kv.set(key, value) }
  async delete(key: string) { this.kv.delete(key) }
}

class FakeConnection {
  id: string
  sent: string[] = []          // 紀錄這個 conn 收到的所有 message（已 JSON.stringify）
  closed = false
  closeReason?: string
  constructor(id: string) { this.id = id }
  send(msg: string) { this.sent.push(msg) }
  close(code?: number, reason?: string) { this.closed = true; this.closeReason = reason }
}

class FakeParty {
  storage = new FakeStorage()
  connections = new Map<string, FakeConnection>()
  broadcast(msg: string, exclude: string[] = []) {
    for (const [id, conn] of this.connections) {
      if (exclude.includes(id)) continue
      conn.send(msg)
    }
  }
  getConnection(id: string) { return this.connections.get(id) }
}
```

注意：實際 `party/server.ts` 寫好後再對齊 import path / 確切 method 名稱。tasks.md 寫的測試檔放 `party/tests/server.test.ts`，但 vitest.config.ts 的 include 是 `tests/**/*.test.ts`——需要 FE-1 完成後跟 frontend engineer 對齊：要嘛擴 include、要嘛測試檔放 `tests/server/server.test.ts`。

**待確認問題（要問 frontend-engineer）：**
- vitest include glob 要不要擴 `party/**/*.test.ts`？或測試檔統一放 `tests/`？
- `party/server.ts` 的 `Server` class export 名稱
- ID 產生器要不要 inject（讓我們在測試裡 seed 固定 ID 驗防撞）

### 1.2 useRoomSync 測試（QA-2 / Task #6）

**結論：mock partysocket（不 mock 原生 WebSocket）。**

理由：
- `partysocket` 是 lib 提供的 WebSocket wrapper，內建 reconnect / message queue
- 我們在乎的是「composable 呼叫 partysocket 的方式」+「收到 message 後 ref 更新對不對」
- 直接 mock partysocket 比 mock 全域 WebSocket 乾淨：不用煩惱 reconnect / backoff 細節，那些是 lib 的責任

**做法：**

```ts
// vi.mock('partysocket', () => ({
//   default: class FakePartySocket { ... }
// }))
```

提供 `simulateMessage(json)` / `simulateClose()` 等 helper，從外部驅動 composable 行為。

clock offset 中位數測試的 fake timer 設定：

```ts
vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
```

每次 send ping 前 `vi.setSystemTime(...)` 設定 client clock，模擬 simulateMessage(pong) 時帶不同 t2/t3，最後驗 `clockOffset` ref 是 3 個 sample 的中位數。

### 1.3 useTimer.startWithEndAt 測試（QA-3 / Task #9）

**結論：直接擴充既有 `tests/composables/useTimer.test.ts`，重用已有的 fake timer / scope 模式。**

對應 spec：
- `startWithEndAt(endAtMs)` 不重置 `totalSec`
- `remainSec` 從 `endAtMs - Date.now()` 推算
- fake timer 推進後 `remainSec` 隨之下降

## 2. 從 Spec Scenario 對應到測試清單

### QA-1：Server（party/tests/server.test.ts 或 tests/server.test.ts）

| Test ID | Spec Scenario | 驗證點 |
|---------|---------------|--------|
| S1 | 乾淨網址進站 | onConnect 第一次連線 → 產 roomId / hostToken / 預設 state 寫入 storage |
| S2 | room ID 防撞 | seed 連續 ID generator，模擬前 4 次撞已存在 KV、第 5 次成功 |
| S3 | room ID 防撞失敗 | 連續 5 次撞、第 6 次拋 error / 回 server error |
| S4 | Host token 驗證通過 | onMessage(patch, hostToken=正確) → state 更新 + broadcast |
| S5 | Host token 驗證失敗 | onMessage(patch, hostToken=錯誤) → 不更新 + 回 `error: forbidden` |
| S6 | Patch broadcast | 兩個 conn 都收到 update（且 sender 也收到，或 exclude？需對齊實作） |
| S7 | Hydrate on new connection | viewer 連上 → 立刻收到 hydrate |
| S8 | ping/pong | 收 ping(t1) → 回 pong(t1, t2, t3)，t2 ≤ t3 |
| S9 | Kicked 兩 host 同 token | 第一個 host 連上 → activeHostConnId=A；第二個 host 同 token 連上 → A 收到 kicked + close、activeHostConnId=B |
| S10 | Room-not-found | viewer 連到 storage 沒有的 room → 回 `error: room-not-found` |
| S11 | onClose 清 activeHostConnId | host A close → activeHostConnId=null；新 host 進不會誤觸 kick |
| S12 | Viewer 不影響 activeHostConnId | host A 連上後 viewer 連上 → activeHostConnId 仍是 A |

### QA-2：useRoomSync（tests/composables/useRoomSync.test.ts）

| Test ID | Spec Scenario | 驗證點 |
|---------|---------------|--------|
| C1 | connect → hydrate | simulate(hydrate) → roomState ref 更新成 server state |
| C2 | clock offset 中位數 | simulate 3 個 pong（offset = -50 / +10 / +30）→ clockOffset ref = 10 |
| C3 | host send patch | isHost=true 時呼叫 patch helper → socket.send 收到 `{type:'patch',hostToken,changes}` |
| C4 | viewer 不能 send patch | isHost=false 時呼叫 patch helper → 應 throw 或 no-op |
| C5 | 收 update 更新 ref | simulate(update) → roomState 更新（Object.assign） |
| C6 | 收 kicked | simulate(kicked) → isHost=false + 觸發 onKicked callback |
| C7 | 收 room-not-found | simulate(error: room-not-found) → 觸發 onRoomNotFound callback |
| C8 | visibilitychange→visible | dispatchEvent(visibilitychange)、 document.visibilityState='visible' → 重做 ping + 重請 hydrate |
| C9 | clock offset 標準差過大 warning（design.md 提到）| 3 個 sample 方差 > 500ms → 觸發 onClockSkewWarning（如果有實作） |

### QA-3：useTimer.startWithEndAt（擴充 tests/composables/useTimer.test.ts）

| Test ID | Spec Scenario | 驗證點 |
|---------|---------------|--------|
| TS1 | startWithEndAt 基本 | setSystemTime(t0)、startWithEndAt(t0 + 30_000) → status='running'、remainSec≈30 |
| TS2 | 不重置 totalSec | setDuration(60) → startWithEndAt(now+30_000) → totalSec 仍為 60、remainSec≈30 |
| TS3 | 倒數隨時間下降 | startWithEndAt(now+30_000) → advanceTimersByTime(10_000)+RAF tick → remainSec≈20 |
| TS4 | startWithEndAt 已過時 | startWithEndAt(now-1_000) → 立即進入 done + 觸發 onDone |

## 3. Common test patterns 參考

從既有測試學到的可複用 pattern：

- `effectScope()` 包 composable（避免測試結束後 watcher 殘留）
- `vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame'] })`
- 顯式 RAF tick：`vi.advanceTimersByTime(16)` 模擬一個 frame
- 用 `ref` + `nextTick()` 驅動響應式測試（useMilestones pattern）
- `vi.fn()` 當 callback、用 `toHaveBeenCalledWith(expect.objectContaining({...}))` 驗 payload

## 4. 風險 / 已知問題

1. **PartyKit testing 生態尚不成熟**：沒看到官方 vitest helper。走純單元測試（fake Party / Connection）是務實選擇，但要跟 frontend engineer 對齊 server 介面以方便注入。
2. **Server-side timing 測試**：ping/pong 的 t2/t3 是 server 內部時間，測試裡用 `vi.setSystemTime` 控制，但要確認 server 用的是 `Date.now()` 而不是某個外部 clock。
3. **Vue ref reactivity in non-component context**：useRoomSync 不一定在 component setup 裡跑（可能是 standalone）。要用 `effectScope` 包好，否則 watcher 不會跑。
4. **partysocket reconnect timing**：我們不測 reconnect 細節（那是 lib 責任），但要驗 visibility→visible 觸發重新 sync 的部分（QA-2 C8）。
5. **Server 測試 file 位置**：tasks.md 寫 `party/tests/server.test.ts` 但 vitest include 是 `tests/**/*.test.ts`。預期 FE-1 會把 vitest include 擴到 `party/tests/`，否則我要把測試放 `tests/server.test.ts`。

## 5. 工作流程提醒

被叫醒時：
1. TaskUpdate 把對應 QA task 設為 in_progress 並 claim owner
2. 先用 `tests/helpers/fakeParty.ts`（QA-1）或 mock partysocket（QA-2）寫好 infra
3. 照 §2 表格逐項寫測試
4. `pnpm test` 全綠 → commit（message 跟 task description 對齊）
5. SendMessage 回報 team-lead
