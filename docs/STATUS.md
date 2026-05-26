# Project Status — 2026-05-25

給接手的新 Claude：這份是**當前最即時的工作交接**，跟 README.md / DECISIONS.md 互補：

- `README.md` = 專案是什麼（穩定文件）
- `docs/DECISIONS.md` = 為什麼這樣做 + 已知雷（穩定文件）
- `docs/STATUS.md`（本文） = **現在進度到哪、下一步做什麼**（會經常變動）

---

## 一句話總結

tickle **正在 `feat/room-sync` 分支**做跨裝置即時 sync（PartyKit + host/viewer 主控模式）。171 個單元測試全綠、`pnpm build` 通過。**FE 工作完成、剩 CI 部署 + 手動驗收**。

---

## 整體進度

| 階段 | 狀態 | 備註 |
|------|------|------|
| 設計與 mockup | ✅ 完成 | `mockup.html` 已凍結；`mockups/room-sync/` 4 個新設計 sign-off |
| Vite + Vue 3 + TS 架構 | ✅ 完成 | 11 元件 + 9 composables |
| Tailwind v4 樣式 | ✅ 完成 | MUKJA 風米白橘 |
| Web Audio 五種音效 | ✅ 完成 | gong / bell / chime + polite / cheer / drumGong |
| iPad 音訊解鎖 overlay | ✅ 完成 | viewer 也會顯示（解鎖警告音） |
| Wake Lock | ✅ 寫了 | iOS 17+；待實機驗收 |
| Tab title 同步剩餘時間 | ✅ 完成 | |
| 桌面 Fullscreen API 全螢幕按鈕 | ✅ 完成 | `useFullscreen` + hover-reveal |
| **Room-sync（add-room-sync change）** | ✅ FE 部分完成 | 見下方明細 |
| 171 個單元測試 | ✅ 全綠 | 含 server 測試 + useRoomSync + useTimer.startWithEndAt |
| OpenSpec change `add-vitest-tdd` | ✅ 完成 | |
| OpenSpec change `add-room-sync` | 🟡 FE 完成、CI / 部署 / 手動驗收待做 | 見「下一步」 |
| GitHub Pages 實際部署 | ✅ 完成 | https://s1041613.github.io/tickle/ |
| GitHub Actions 加 PartyKit deploy 步驟 | ⏳ FE-10（Task #14）| 需要 PartyKit token secret |
| iPad Safari 實機驗收（9 個場景） | ⏳ QA-4（Task #15）| Mac + iPad 兩台並排 |
| Playwright E2E 測試 | ⏳ 未開始 | 計畫中，下一輪 |

### `add-room-sync` 完成項目（截至 2026-05-25）

| Task | 內容 | 狀態 |
|---|---|---|
| FE-1 | Tooling（partykit.json / vite proxy / tsconfig / hello-world wiring） | ✅ |
| FE-2 | PartyKit server（party/{types,idGen,server}.ts；onConnect/onMessage/onClose 全套） | ✅ |
| FE-3 | useRoomSync composable（host/viewer/create modes + clock offset + visibility re-sync） | ✅ |
| FE-4 | URL 重構（useUrlSync 從 watch-write → URL helper） | ✅ |
| FE-5 | useTimer.startWithEndAt（viewer 用 server endAt 啟動） | ✅ |
| FE-6 | App.vue 整合（host/viewer 切換、echo guard、placeholder） | ✅ |
| FE-7 | UI 元件（ShareButton / ShareDialog / RoomNotFoundScreen / KickedRibbon / ViewerBadge + SettingsPanel readOnly + TimerDisplay subtitle） | ✅ |
| FE-8 | useShareLink composable（state machine + clipboard fallback） | ✅ |
| FE-9 | 文件更新（本文 + README + DECISIONS + spec/design drift 修正） | ✅ |
| QA-1 | PartyKit server 單測（in-memory FakeRoom，S1–S12 全套） | ✅ |
| QA-2 | useRoomSync 單測（mock WebSocket） | ✅ |
| QA-3 | useTimer.startWithEndAt 單測 | ✅ |
| FE-10 | GitHub Actions 加 `pnpm party:deploy` | ⏳ |
| QA-4 | 手動驗收 9 個場景（Mac + iPad） | ⏳ |
| QA-5 | 最終 validation（pnpm test / build / openspec validate） | ⏳ |

---

## 最近完成（add-room-sync 本輪）

按 task 順序：

1. **PartyKit 基礎建設（FE-1 / FE-2）**
   - 新增 `party/` 子目錄、`partykit.json`、`pnpm party:dev` / `party:deploy` scripts
   - `vite.config.ts` 加 dev proxy `/parties/*` → `localhost:1999`
   - `tsconfig.json` 把 `party/**` 納入型別檢查
   - `party/server.ts` 完整實作 `TickleSyncServer`：onConnect（create / host-reconnect / viewer / collision / room-not-found）/ onMessage（ping-pong / patch 雙重驗證 / sanitize / bad-message）/ onClose

2. **Client room-sync（FE-3 / FE-4 / FE-5）**
   - `useRoomSync.ts`：partysocket 連線、3 種 mode（create / host / viewer）、clock offset NTP 4-timestamp 中位數、shallowRef state、visibilitychange 重做 sync、kicked / room-not-found callbacks
   - `useUrlSync.ts` 大幅縮減：移除 watch-write，改成 `loadFromLegacyUrl` / `read/writeRoomParam` / `clearLegacyUrlParams` 純函式
   - `useTimer.ts` 加 `startWithEndAt(endAtMs)` 給 viewer 用（不重置 totalSec、直接用外部 endAt）

3. **App.vue 整合（FE-6）**
   - `resolveMode()` 根據 URL 決定連線模式
   - `applyingFromServer` echo-suppression guard 防死循環
   - Server state → 4 個本地設定 ref（含 `shallowSameWarnings` identity check）
   - Host watch ref 變動 → sendPatch；viewer onDone 不 restart（等 host broadcast）

4. **UI 元件（FE-7 / FE-8）**
   - 5 個新元件：`ShareButton` / `ShareDialog`（teleport-to-body modal） / `RoomNotFoundScreen`（自己 own 倒數 + redirect） / `KickedRibbon`（role=status aria-live=polite + X close button） / `ViewerBadge`（綠 pulse dot）
   - `SettingsPanel` 加 `readOnly` prop：unscoped `.is-readonly` namespace 灰所有 input/select/button、「+ 新增警告」`v-if="!readOnly"` 完全不渲染、頂部 viewer hint banner
   - `TimerDisplay` 加 subtitle prop（viewer 顯示「由 host 控制中」）
   - `useShareLink.ts`：viewerUrl ref + 4-state machine（idle/copying/copied/error）+ navigator.clipboard 主路徑 + execCommand fallback

5. **測試（QA-1 / QA-2 / QA-3）**
   - PartyKit server 測試（`tests/server/`）：in-memory `FakeRoom` / `FakeStorage` / `FakeConnection`，覆蓋 S1–S12 共 20+ 場景
   - `useRoomSync.test.ts`：mock WebSocket，覆蓋 hydrate / clock offset 中位數 / patch / kicked / room-not-found / visibility re-sync
   - 既有 useTimer 測試擴充 `startWithEndAt`
   - 從 33 個成長到 **171 個**單元測試（12 files）全綠

6. **規格 / 文件**
   - OpenSpec `add-room-sync`：`proposal.md` / `design.md` / `specs/room-sync/spec.md` / `tasks.md` 全寫
   - 本輪修正 spec / design drift：ID 防撞改 client retry 描述、加 S5b not-active-host + S12 bad-message scenarios
   - 本文（STATUS.md）+ README.md + DECISIONS.md 同步更新

---

## 已知未解問題 / 技術債

### 1. `handlePanelClose` 沒測試保護（既有，未變動）
**位置**：`src/App.vue`
**狀況**：「設定面板關閉時若 timer 是 done 狀態就 reset」這段邏輯只有 4 行，但寫在 App.vue 裡、單元測試不會涵蓋。**刻意先不抽 composable**，等被改壞過再說。

### 2. iPad 實機未測 room-sync 全流程
**狀況**：之前單機部分有部分 iPad 行為已知（音訊解鎖 OK）；**room-sync 整套（host Mac + viewer iPad、kicked 流程、reconnect、clock 同步精度）尚未實機驗收**。
**下一步**：QA-4（Task #15）9 個場景手動驗收清單跑完。

### 3. Coverage 報告未跑（既有）
**狀況**：沒裝 `@vitest/coverage-v8`；目前 171 測試覆蓋實用、不裝也行。

### 4. PartyKit 部署 + token secret 未設
**狀況**：`pnpm party:deploy` 還沒在 GitHub Actions 跑過、PartyKit secret 未配置。
**下一步**：FE-10（Task #14）加 deploy 步驟 + 設 secret + 確認 `tickle-sync.<handle>.partykit.dev` URL。

### 5. ShareDialog QR code 還是 placeholder
**狀況**：spec 預留 QR 區域（96×96 dashed），未來接 `qrcode` lib（design.md 提到）。沒擋住 MVP。
**下一步**：MVP 後加，非 blocking。

### 6. useShareLink 沒專屬單測
**狀況**：jsdom 沒實作 `navigator.clipboard`，core clipboard 行為要 Playwright 或實機驗。`stripHostParam` 純函式好測但沒人寫測試。
**下一步**：QA-4 手動驗收可包含；之後可加 stripHostParam 單測。

### 7. Playwright E2E 計畫未開始（既有）
**狀況**：DECISIONS.md 提過 Vue 元件 visual + handlePanelClose 邏輯是 E2E 才能保護。
**下一步**：room-sync merge 後再開 OpenSpec change `add-playwright-e2e`。

---

## 下一步建議路線

`add-room-sync` 剩餘 task：

### 路線 A：完成 add-room-sync 收尾（推薦）
1. **FE-10** GitHub Actions 加 `pnpm party:deploy` 步驟 + 設 PartyKit token secret
2. 推 PR 到 main、確認 Actions 全綠（test → build → frontend deploy → partykit deploy）
3. **QA-4** 在 Mac + iPad 兩台跑 9 個場景驗收清單（OpenSpec tasks 12.1–12.9）
4. **QA-5** 最終 validation（`pnpm test` / `pnpm build` / `openspec validate add-room-sync`）
5. Merge `feat/room-sync` → main，封存 OpenSpec change

### 路線 B：merge 後再規劃下一輪
- Playwright E2E（補 UI 互動 / visual regression）
- Room 持久化策略（30 天閒置過期、規模到再加）
- Host 移交 / 多 host 並存（產品決策）
- QR code 真實渲染（接 `qrcode` lib）
- localStorage 記憶最近 host URL（同裝置重開續用）

---

## 開工前 30 秒檢查清單

新 Claude 接手時，跑一遍這些確認狀態：

```bash
cd /Users/zoe/Documents/Claude/worktrees/add-room-sync  # 或 main repo
pnpm test                           # 預期：171 passed (12 files)
pnpm build                          # 預期：成功，無 vue-tsc 錯誤
pnpm dev                            # 開 http://localhost:5173/tickle/
pnpm party:dev                      # 另一個 terminal，PartyKit 在 :1999
openspec validate add-room-sync     # 預期：valid
openspec validate add-vitest-tdd    # 預期：valid
```

若任一綠掉，先修綠再做新東西。

---

## 給新 Claude 的提示

- 對話時用**繁體中文**（zoe 偏好）
- 程式碼註解、commit message、PR 用**英文**
- **不要急著寫 code**，先讀 README → DECISIONS → 這份 STATUS
- 改任何 composable 都跑 `pnpm test` 確認沒打到回歸保護
- TDD 節奏：紅 → 綠 → refactor。zoe 已經養成這個節奏，可以延續
- 對 UI 改動：講解「為什麼這樣設計」比直接 patch 重要，zoe 會主動指出更好的方案
- 遇到「面板蓋住主畫面」這類視覺問題，先看 DECISIONS.md bug 區，可能已經有結論
