// QA-3 骨架（useTimer.startWithEndAt 單元測試）
// 等 FE-5 完成後把這些 case 併入 tests/composables/useTimer.test.ts（既有檔案）
// 不要新建 tests/composables/useTimer.startWithEndAt.test.ts —— 重用既有 fake timer / scope 模式
//
// 此檔放 tests/notes/ 避免被 vitest 收走、僅作 reference。
//
// 對應 spec.md：
//   - Requirement: Server is authoritative — Hydrate on connect
//     "Viewer client 用收到的 endAtMs + 自己算好的 clockOffset 算當前 remaining"
//   - Requirement: Reconnect preserves running state
//     "Client 重新算 clock offset、用 server 的 endAtMs 算當前 remaining、繼續 rAF 渲染"
//
// 既有 useTimer 測試風格參考：tests/composables/useTimer.test.ts
import { describe, it } from 'vitest'

describe('useTimer.startWithEndAt（FE-5 新增的方法）', () => {
  it.todo('TS1: startWithEndAt(now + 30_000) → status="running"、remainSec ≈ 30')
  // setup:
  //   - vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
  //   - vi.setSystemTime(1_000_000)
  //   - timer.startWithEndAt(1_000_000 + 30_000)
  //   - vi.advanceTimersByTime(16) // flush RAF
  // assert:
  //   - timer.status.value === 'running'
  //   - timer.remainSec.value === 30（或極接近 30，因為 RAF tick 已跑過一次）

  it.todo('TS2: startWithEndAt 不重置 totalSec（呼叫前 setDuration(60)，呼叫後 totalSec 仍是 60）')
  // setup:
  //   - timer.setDuration(60)
  //   - vi.setSystemTime(0)
  //   - timer.startWithEndAt(30_000)
  // assert:
  //   - timer.totalSec.value === 60
  //   - timer.remainSec.value ≈ 30
  //   - 進度條算法（remainSec/totalSec）仍合理

  it.todo('TS3: startWithEndAt(now + 30_000) 後 advanceTimersByTime(10_000) + RAF tick → remainSec ≈ 20')
  // setup:
  //   - vi.setSystemTime(1_000_000)
  //   - timer.startWithEndAt(1_000_000 + 30_000)
  //   - vi.advanceTimersByTime(10_000)
  //   - vi.advanceTimersByTime(16)（RAF flush）
  // assert:
  //   - timer.remainSec.value 落在 19.9 ~ 20.1

  it.todo('TS4: startWithEndAt 傳入過去時間 → 立即 done、觸發 onDone 一次')
  // setup:
  //   - const doneCb = vi.fn()
  //   - timer.onDone(doneCb)
  //   - vi.setSystemTime(1_000_000)
  //   - timer.startWithEndAt(999_000)  // 過去 1 秒
  //   - 跑一個 RAF tick
  // assert:
  //   - timer.status.value === 'done'
  //   - timer.remainSec.value === 0
  //   - doneCb 被呼叫一次

  it.todo('TS5: startWithEndAt 期間呼叫 pause → status="paused"、remainSec 停在當下')
  // 確認既有 pause 行為對 startWithEndAt 啟動的 timer 仍有效

  it.todo('TS6: startWithEndAt 期間呼叫 reset → 回到 idle + totalSec 完整恢復')
})
