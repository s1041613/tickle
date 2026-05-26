// FE-4 重構配套測試骨架
// 等 FE-4（tasks.md §6）完成後把這些 case 併入 tests/composables/useUrlSync.test.ts
//
// 此檔放 tests/notes/ 避免被 vitest 收走、僅作 reference。
//
// 對應 spec.md MODIFIED Requirement: "URL acts as room pointer, not state container"
//   Scenarios:
//     - 設定變動不再寫 URL
//     - 舊 URL 進站相容
//   及 ADDED Requirement: "First-time visit auto-creates a room" 的 Scenario「進站時 URL 已有舊版 params」
//
// 既有 useUrlSync.test.ts 現有 33 個測試（parseWarnings / serializeWarnings / round-trip）
//   - 這些 pure helper 在 FE-4 §6.5 明確要保留 export → 既有測試應全綠不動
//   - 若 FE 改動內部 import path 或 helper signature，這些測試會紅、要回頭跟 FE 對齊
//
// 既有測試風格參考：tests/composables/useUrlSync.test.ts（pure function 不需要 mount / scope）
import { describe, it } from 'vitest'

describe('useUrlSync — FE-4 重構新增 API', () => {
  describe('loadFromLegacyUrl()（tasks.md §6.2）', () => {
    it.todo('LU1: 完整舊 params → 回傳 { duration, warnings, repeat, finalSound }')
    // setup:
    //   - 不需要動 window.location，loadFromLegacyUrl 預期吃 search string 或 URLSearchParams
    //   - 若 FE 設計成從 window.location.search 讀：用 Object.defineProperty 改 location
    // input: '?seconds=300&warn=60:yellow:chime&repeat=true&final=gong'
    // assert:
    //   - duration === 300
    //   - warnings 長度 1、at=60、color='yellow'、sound='chime'
    //   - repeat === true
    //   - finalSound === 'gong'

    it.todo('LU2: 完全沒舊 params → 回傳 null 或全部 undefined（看 FE 設計）')
    // input: '' 或 '?room=abc&host=ht_xxx'
    // assert: 不會誤把 room/host 當設定

    it.todo('LU3: 部分舊 params → 只回有的欄位、其他保持預設 / undefined')
    // input: '?seconds=180'
    // assert: duration === 180、其他欄位 undefined / 預設值

    it.todo('LU4: 舊 params 與 room/host 共存 → 設定值正確 parse、不影響 room/host 讀取')
    // input: '?room=abc&host=ht_x&seconds=120&warn=30:red:gong'
    // assert: duration === 120、warnings 對；room/host 由不同 API 讀（不衝突）
  })

  describe('clearLegacyUrlParams()（tasks.md §6.4）', () => {
    it.todo('CL1: 呼叫後 URL 只剩 room 與 host param、舊 params 全清')
    // setup:
    //   - window.history.replaceState({}, '', '?seconds=300&warn=60:yellow:chime&room=abc&host=ht_x')
    //   - useUrlSync().clearLegacyUrlParams() 或對應 export
    // assert:
    //   - new URL(location.href).searchParams.get('room') === 'abc'
    //   - .get('host') === 'ht_x'
    //   - .get('seconds') === null
    //   - .get('warn') === null
    //   - .get('repeat') === null
    //   - .get('final') === null

    it.todo('CL2: 已經沒舊 params → no-op、不報錯、不改變 URL')

    it.todo('CL3: 沒 room/host param → 不會把 URL 清成空字串（保險）')
    // 這是邊角 case，但避免「使用者進站還沒建好 room 時被 clear」誤殺 URL
  })

  describe('room / host param 讀寫（tasks.md §6.3）', () => {
    it.todo('RH1: readRoomParam() → 從 URL 讀 room param 回傳 string | null')
    it.todo('RH2: readHostParam() → 從 URL 讀 host param 回傳 string | null')
    it.todo('RH3: writeRoomAndHost(id, token) → history.replaceState 把 URL 改成 ?room=id&host=token')
    it.todo('RH4: writeRoomAndHost(id, null) → URL 變成 ?room=id（不含 host）— viewer URL 用')
  })

  describe('既有設定 ref 不再 watch-write URL（tasks.md §6.1）', () => {
    it.todo('NW1: 改 duration ref 後 location.search 沒變化（舊 watch-write 行為已移除）')
    // 這個 case 重要：spec.md "設定變動不再寫 URL" Scenario
    // setup:
    //   - useUrlSync 不再 return 用 setter 把值同步進 URL 的 ref
    //   - 或：return 的 ref 改值後驗 location 不變
    // assert: history.replaceState / pushState 沒被呼叫（vi.spyOn）

    it.todo('NW2: 改 warnings ref 後 location.search 沒變化')
    it.todo('NW3: 改 finalSound / repeat ref 後 location.search 沒變化')
  })
})

describe('既有 33 個測試 regression（FE-4 §6.5 要求保留）', () => {
  // 這些是備忘 — 不重寫測試本體，只在這裡列出「FE-4 改完後要驗證仍綠的測試 ID」：
  //   - parseWarnings T1 / T2 / T2b / T2c / T3 / T3b / T3c / T3d
  //   - serializeWarnings（無 ID、兩個 it）
  //   - round-trip T4 / T4b
  //
  // 如果 FE 把 parseWarnings / serializeWarnings 從 useUrlSync export 拔掉 → 馬上紅、要 SendMessage 給 FE 對齊
  it.todo('REG: import { parseWarnings, serializeWarnings } from useUrlSync 仍有效')
})
