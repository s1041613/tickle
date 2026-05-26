# tickle

可自訂警告里程碑的全螢幕倒數計時器，主要使用情境：電腦端設定好 URL 後丟到 **iPad Safari** 顯示（上課、會議、考試等現場計時）。

🌐 **Live**: [https://s1041613.github.io/tickle/](https://s1041613.github.io/tickle/)

> 👉 **新接手開發前的讀稿順序**：
> 1. 這份 **README** — 專案是什麼、架構長怎樣
> 2. **[`docs/STATUS.md`](docs/STATUS.md)** — 當前進度、下一步、開工檢查清單
> 3. **[`docs/DECISIONS.md`](docs/DECISIONS.md)** — 已被排除的方案、踩過的雷、刻意不做的東西

## 特色

- 大數字全螢幕、`28vw` 自適應字級
- 任意多組警告里程碑（剩餘秒數 + 顏色 + 音效）
- 三段獨立背景顏色（黃 / 橘 / 紅）與配套深色數字
- 五種音效：Web Audio 合成的 `gong` / `bell` / `chime`，以及 AAC 真實錄音 `polite` / `cheer`（CC0 / Mixkit Free License）
- iPad 首次點擊解鎖音訊 overlay
- Wake Lock 防止 iPad 自動鎖屏
- Tab title 顯示剩餘時間
- **跨裝置即時狀態分享（host / viewer 主控模式）**：host 端按下開始，所有連上同 room 的 viewer 0.5 秒內看到對應變化、倒數與 host 同步（誤差 < 200ms）
- 桌面瀏覽器右上角全螢幕按鈕（Fullscreen API；iPad Safari 自動隱藏）

## 技術棧

- **Vite 6** — 建置與 dev server
- **Vue 3** `<script setup>` + TypeScript
- **Tailwind CSS v4**（CSS-first `@theme` 設計 token）
- **PartyKit**（Cloudflare Durable Objects 包裝）+ **partysocket** — 跨裝置 realtime state sync
- **Vitest 4** + jsdom + `@vue/test-utils` — 單元測試
- **GitHub Pages** + GitHub Actions — 前端部署
- **OpenSpec** — 規格驅動的變更管理

## 專案結構

```
tickle/
├── index.html                          # Vite entry
├── mockup.html                         # 視覺設計參考（純 HTML/JS，已凍結）
├── partykit.json                       # PartyKit 部署設定（entry = party/server.ts）
├── vite.config.ts                      # base: '/tickle/'、proxy /parties/* → :1999
├── vitest.config.ts                    # jsdom 環境、tests/ 為 include 範圍
├── tsconfig.json                       # include src + tests + party
├── package.json
│
├── src/
│   ├── main.ts                         # createApp(App).mount('#app')
│   ├── App.vue                         # 頂層組裝：composable 組合 + 三顆主畫面按鈕 + room-sync 整合
│   ├── style.css                       # Tailwind 入口、@theme tokens、state-* class、keyframes
│   ├── types.ts                        # Warning / ColorKey / SoundKey / TimerState + COLOR_TO_STATE map
│   ├── vite-env.d.ts                   # Vue SFC 型別宣告
│   │
│   ├── components/
│   │   ├── TimerDisplay.vue            # 全螢幕大數字（顏色隨 state 切換）+ optional subtitle
│   │   ├── SettingsPanel.vue           # 右側滑入的圓角面板（含 readOnly 模式給 viewer）
│   │   ├── WarningCard.vue             # 單一警告里程碑 row（秒數 / 顏色 / 音效 / 刪除）
│   │   ├── ToggleSwitch.vue            # iOS 風 toggle 開關
│   │   ├── SectionTag.vue              # 黃色斜方塊小標籤（MUKJA 風）
│   │   ├── AudioUnlockOverlay.vue      # iPad 首次點擊解鎖音訊的全螢幕橘色 overlay
│   │   ├── ShareButton.vue             # 左下 host-only 分享按鈕（pill + link icon）
│   │   ├── ShareDialog.vue             # 中央 modal：viewer URL 顯示 + 複製按鈕 + QR placeholder
│   │   ├── RoomNotFoundScreen.vue      # 全螢幕引導（米白底 + 圓 disc + 倒數 + 自動 redirect）
│   │   ├── KickedRibbon.vue            # 上緣 yellow ribbon：「此分頁已被新分頁取代」
│   │   └── ViewerBadge.vue             # 左上 viewer 身份 pill（黑底 + 綠 pulse dot）
│   │
│   └── composables/
│       ├── useTimer.ts                 # 倒數核心：rAF + endAtMs 計算、status 機、onDone callbacks、startWithEndAt
│       ├── useMilestones.ts            # 警告觸發判定（去重）+ visualState / activeLabel
│       ├── useAudio.ts                 # AudioContext + Web Audio 合成 gong/bell/chime + 解鎖
│       ├── useUrlSync.ts               # URL helper（loadFromLegacyUrl / read|writeRoom|HostParam / clearLegacyUrlParams / parseWarnings / serializeWarnings）— 不再 watch-write
│       ├── useRoomSync.ts              # WebSocket connection + reactive room state（host / viewer / create modes）+ clock offset
│       ├── useShareLink.ts             # viewerUrl + clipboard state machine + popstate sync
│       ├── useWakeLock.ts              # Screen Wake Lock API（iOS 17+），visibilitychange 重新請求
│       ├── useTabTitle.ts              # document.title 隨 status / formatted 更新
│       └── useFullscreen.ts            # Fullscreen API toggle + fullscreenchange 同步 + webkit prefix fallback
│
├── party/                              # PartyKit server (Cloudflare Durable Objects)
│   ├── server.ts                       # TickleSyncServer：onConnect / onMessage / onClose
│   ├── types.ts                        # 共用 wire types（RoomState / ClientMessage / ServerMessage）
│   └── idGen.ts                        # generateRoomId / generateHostToken（crypto.getRandomValues）
│
├── tests/
│   ├── setup.ts                        # 全域 afterEach 還原 timers + mocks
│   ├── composables/                    # 純邏輯 composable 測試
│   │   ├── useUrlSync.test.ts          # parse/serialize/round-trip
│   │   ├── useTimer.test.ts            # fake timers + RAF 模擬倒數核心（含 startWithEndAt）
│   │   ├── useMilestones.test.ts       # 警告觸發 + 狀態轉換（含 bug #3 回歸保護）
│   │   ├── useRoomSync.test.ts         # mock WebSocket，覆蓋 hydrate / clock offset / patch / kicked / room-not-found
│   │   └── integration.test.ts         # duration watcher + repeat 自動重啟
│   └── server/                         # PartyKit server 端測試
│       ├── fakeRoom.ts                 # in-memory FakeRoom / FakeStorage / FakeConnection
│       └── server.test.ts              # S1–S12 全套 onConnect / onMessage / onClose 行為
│
├── mockups/
│   └── room-sync/                      # UX 設計稿（FE-7 對著實作）
│       ├── share-button.html
│       ├── share-dialog.html
│       ├── room-not-found.html
│       └── kicked-and-disabled-state.html
│
├── openspec/changes/
│   ├── add-vitest-tdd/                 # 上一輪 change（Vitest TDD，已實作）
│   └── add-room-sync/                  # 本輪 change（room sync 主體）
│       ├── proposal.md
│       ├── design.md
│       ├── tasks.md
│       └── specs/room-sync/spec.md     # Requirements + Scenarios（含 S1–S12 server 行為）
│
└── .github/workflows/
    └── deploy.yml                      # pnpm test → pnpm build → GitHub Pages
                                        # （計畫加 pnpm party:deploy 步驟，待 FE-10）
```

## 核心架構：composable 切分原則

每個 composable 只負責一個關注點，彼此用 `Ref` 串接（**禁止反向 import**）：

| Composable | 輸入 | 輸出 | 副作用 |
|------------|------|------|--------|
| `useTimer` | — | `status`, `remainSec`, `formatted`, `start/startWithEndAt/pause/reset/setDuration/onDone` | requestAnimationFrame, Date.now |
| `useMilestones` | `remainSec`, `status`, `warnings`, `onTrigger` | `visualState`, `activeLabel`, `triggered` | — |
| `useAudio` | — | `ensureAudio`, `playSound`, `unlocked`, `stopAll`, `preloadSound` | AudioContext, OscillatorNode |
| `useUrlSync` | — | `loadFromLegacyUrl` / `readRoomParam` / `readHostParam` / `writeRoomAndHost` / `clearLegacyUrlParams` / `parseWarnings` / `serializeWarnings` | history.replaceState |
| `useRoomSync` | `mode` (create / host / viewer) + callbacks | `status`, `isConnected`, `isHost`, `roomState`, `clockOffset`, `sendPatch`, `serverNow` | WebSocket (partysocket), visibilitychange |
| `useShareLink` | — | `viewerUrl`, `copyState`, `copyToClipboard`, `refresh` | navigator.clipboard / popstate |
| `useWakeLock` | `status` | — | navigator.wakeLock + visibilitychange |
| `useTabTitle` | `formatted`, `status` | — | document.title |
| `useFullscreen` | — | `isFullscreen`, `isSupported`, `toggle` | document.requestFullscreen + fullscreenchange |

`App.vue` 是組裝層：建立四個設定 ref（`duration` / `repeat` / `warnings` / `finalSound`），用 composable 把它們接到 timer 行為與 UI 元件上；用 `useRoomSync` 將設定 ref 與 server state 雙向同步（host 改動 → send patch；server broadcast → 套用到 ref，靠 `applyingFromServer` guard 防 echo loop）。

## 視覺狀態機

| 狀態 | 背景 | 數字顏色 | 主按鈕 |
|------|------|--------|--------|
| `default` | `#FAF7F2` 米白 | `#1C1410` 近黑 | ▶ 開始 |
| `warn-yellow` | `#FFEBC2` 暖杏黃 | `#B07A2A` 暖肉桂棕 | ⏸ 暫停 |
| `warn-orange` | `#FFD4B8` 暖桃橘 | `#B84A1F` 深橘 | ⏸ 暫停 |
| `warn-red` | `#FFB3B3` 淺紅 | `#C42028` 深紅 | ⏸ 暫停 |
| `done` | `#FF6B3D` 橘色脈動 | `#FFFFFF` 白 | ▶ 再來一次 |
| 暫停時 | 維持當下顏色 | 維持 | ▶ 繼續 + ↻ 重設 |

## URL 參數

進站後 URL 變成 room 指針，**只有兩個 param**：

| 參數 | 範例 | 說明 |
|------|------|------|
| `room` | `k7m3p9` | Room ID（6 位英數、31 字元集排除 `0/O/1/l/I/o`）。**所有打開同 room 的 client 都看到同一個 timer 狀態。** |
| `host` | `ht_abc123...` | Host token（`ht_` + 16 位英數）。**只有持有此 token 才能控制計時器**；分享給觀眾的 URL 應該拿掉這個參數。 |

完整範例：
- Host URL（可控制）：`https://tickle.app/?room=k7m3p9&host=ht_abc123def456789`
- Viewer URL（唯讀）：`https://tickle.app/?room=k7m3p9`

第一次進站時 URL 沒有 `room`，client 會自動連 PartyKit、建立新 room、把 URL 用 `history.replaceState` 補成上面格式。

### Legacy URL 相容（自動遷移）

舊版的四個設定參數仍可進站：

| 舊參數（不再寫入） | 範例 |
|---|---|
| `seconds` | `300` |
| `repeat` | `true` |
| `warn` | `60:orange:bell,30:red:gong` |
| `final` | `gong` |

打開帶舊參數的 URL 時，client 會：
1. 把舊參數 parse 成新 room 的初始設定
2. 連 PartyKit 建 room
3. 自動把舊參數從 URL 拿掉，只留 `?room=<id>&host=<token>`

可選值（與舊版一致）：
- 顏色：`yellow` / `orange` / `red`
- 音效：`chime` / `bell` / `gong` / `polite` / `cheer` / `drumGong`

### Host vs Viewer 行為

| 行為 | Host（有 `host` 參數） | Viewer（只有 `room`） |
|---|---|---|
| 看到倒數 | ✅ | ✅ 即時同步 host 畫面 |
| 按開始 / 暫停 / 重設 | ✅ | ❌ disabled |
| 改 duration / warnings / 結束音效 | ✅ | ❌ panel 唯讀（仍可看到設定） |
| 看到「複製連結」按鈕（左下） | ✅ | ❌ 不渲染 |
| 收到警告音效 | ✅ | ✅（首次需要點螢幕解鎖音訊） |
| Reload 後接續 | ✅ host token 仍在 URL | ✅ |

## 開發

```bash
pnpm install
pnpm dev              # http://localhost:5173/tickle/
pnpm test             # 跑一次所有測試（CI 用）
pnpm test:watch       # 開發中 watch 模式
pnpm test:ui          # Vitest UI 介面
pnpm build            # vue-tsc 型別檢查 + 產出 dist/
pnpm preview          # 預覽 production build
```

## 測試

171 個單元測試（12 個檔案）覆蓋核心邏輯：

```bash
pnpm test
# Test Files  12 passed
#      Tests  171 passed
#   Duration  ~1.8s
```

**測試範圍**：
- ✅ `useUrlSync` — `parseWarnings` / `serializeWarnings` 邊界 + round-trip
- ✅ `useTimer` — `start` / `pause` / `resume` / `reset` / `done callbacks` + `startWithEndAt`（viewer 用）
- ✅ `useMilestones` — 警告觸發、去重、狀態轉換（含 bug regression）
- ✅ `useRoomSync` — mock WebSocket：connect → hydrate / clock offset 中位數 / patch / kicked / room-not-found / visibility re-sync
- ✅ PartyKit server — in-memory `FakeRoom` 跑 `onConnect` / `onMessage` / `onClose` 全套 S1–S12 行為
- ✅ 整合 — duration watcher + repeat 自動重啟

**不在範圍**（待 E2E 補）：
- ❌ `useAudio` / `useWakeLock` / `useTabTitle` — 副作用過重，需實機
- ❌ `useShareLink` clipboard 行為 — jsdom 沒實作 `navigator.clipboard`，留給 Playwright
- ❌ Vue 元件 visual rendering — 用 Playwright + 截圖比對處理
- ❌ PartyKit production 連線 / Cloudflare 真實 DO 行為 — `tests/server/` 用 FakeRoom 跑邏輯，wire-level 互通要實機驗收（手動清單見 OpenSpec tasks 12.x）

## 部署

推到 `main` 分支 → GitHub Actions 自動 `pnpm test` → `pnpm build` → 發布到 `https://s1041613.github.io/tickle/`

**啟用 GitHub Pages**：repo Settings → Pages → Source 選 **GitHub Actions**

## PartyKit Backend

跨裝置即時 sync 由 **PartyKit**（Cloudflare Durable Objects 的薄包裝）提供。Server code 在 `party/` 子目錄、用 WebSocket 跟 client 通訊，每個 room 對應一個 Durable Object instance。

### 本機開發

```bash
pnpm party:dev     # 在 :1999 起 PartyKit dev server（含 hot reload）
pnpm dev           # 在 :5173 起 Vite，已 proxy /parties/* → :1999
```

兩個都跑時，前端會走 vite proxy 連到本機 PartyKit，免處理 CORS / origin。

`party/` 結構：

```
party/
├── server.ts        # TickleSyncServer：onConnect / onMessage / onClose
├── types.ts         # 共用 wire types（RoomState / ClientMessage / ServerMessage）
└── idGen.ts         # generateRoomId() / generateHostToken()，用 crypto.getRandomValues
```

### 部署

#### 首次部署（zoe 設定一次）

1. `npx partykit login` — 用 GitHub OAuth 登入、產生 `~/.partykit/config.json`
2. 確認 `partykit.json` 的 `name`（目前 `tickle-sync`）+ 預期 deploy URL：`tickle-sync.<your-handle>.partykit.dev`
3. 從 [partykit.io dashboard](https://www.partykit.io/) 拿一組 **access token**
4. 在 GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**：
   - Name: `PARTYKIT_TOKEN`
   - Value: 上一步的 access token
5. 若你的 PartyKit handle 不是 `s1041613`，編輯 `.github/workflows/deploy.yml` 把 `VITE_PARTYKIT_HOST` 改成你的真實 hostname

#### 手動部署 / 本機驗證

```bash
pnpm party:deploy  # 把 party/ deploy 到 tickle-sync.<handle>.partykit.dev
```

#### CI 自動部署

push 到 `main` 分支會觸發 `.github/workflows/deploy.yml`：

1. `pnpm test` 通過
2. `pnpm party:deploy`（用 `PARTYKIT_TOKEN` secret）— PartyKit 服務先 live
3. `pnpm build`（注入 `VITE_PARTYKIT_HOST` env，client 端 `useRoomSync` 連 production URL）
4. 上 GitHub Pages

`useRoomSync` 的 host 解析順序：
1. `options.host`（per-call override，主要給測試用）
2. `VITE_PARTYKIT_HOST` env（CI/production build 時注入）
3. `window.location.host`（dev 用，搭配 vite proxy）

dev 跟 production 不會混到：dev 用 same-origin via proxy，production 走 wss 直連 partykit.dev。

### Room 生命週期 & 計費

- **每個 room 是一個 Durable Object instance**，state 存 DO storage（key `state`、~1KB）
- Room **沒人連時 PartyKit 會 hibernate**（不收 duration 費），有人連回來秒復活
- **目前沒做主動清理 / 過期**：規模到（同時 > 10 萬活躍 room）再加 30 天閒置過期；Cloudflare KV 免費 5GB、能撐很久
- **計費敏感度**：採用 event-based broadcast（只在 state 變動時推），不做 server-side 高頻 tick。一個 room 10 個 viewer ≈ 10 條訊息／操作；對比 server-tick 每秒 100 條，1000 倍差距

詳細決策見 `docs/DECISIONS.md` 的「Room-based mode」條目跟 `openspec/changes/add-room-sync/design.md`。

## OpenSpec 變更管理

`openspec/changes/` 下每個變更包含 `proposal.md`（為什麼）/ `design.md`（怎麼做）/ `specs/<capability>/spec.md`（要求）/ `tasks.md`（步驟）。當前的變更：

- `add-vitest-tdd` — 加入 Vitest 單元測試與 TDD 工作流（已實作）
- `add-room-sync` — 跨裝置即時 state 同步（host / viewer 主控模式 + PartyKit backend，本輪實作）

新增變更：`openspec new change <kebab-name>`
驗證：`openspec validate <change-name>`

## iPad 部署實機注意事項

1. **音訊解鎖**：iOS Safari 嚴格規定音訊只能在 user gesture 內首次播放。`AudioUnlockOverlay` 在進站時要求使用者點一下螢幕，藉此呼叫 `AudioContext.resume()` 解鎖。
2. **Wake Lock**：需 iOS 17+。倒數開始時 `navigator.wakeLock.request('screen')`，切到背景後回前景會自動 re-acquire。
3. **rAF 在背景會停**：這個 app 是現場顯示用，背景倒數不需要精準，故未實作 `setTimeout` fallback。
4. **Clap 音效 lazy load**：`polite` / `cheer` 是 AAC 真實錄音，使用者在 SettingsPanel 切到那個選項時才下載 + decode。URL 直接帶 clap 設定時，在解鎖後一次 warm-up。若 buffer 未載完時警告觸發，fallback 播 bell。
5. **PWA**：尚未加 manifest，iPad 仍可用 Safari「加到主畫面」當捷徑使用。
