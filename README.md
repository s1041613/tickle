# BigTimer

可自訂警告里程碑的全螢幕倒數計時器，主要使用情境：電腦端設定好 URL 後丟到 **iPad Safari** 顯示（上課、會議、考試等現場計時）。

> 👉 **新接手開發前的讀稿順序**：
> 1. 這份 **README** — 專案是什麼、架構長怎樣
> 2. **[`docs/STATUS.md`](docs/STATUS.md)** — 當前進度、下一步、開工檢查清單
> 3. **[`docs/DECISIONS.md`](docs/DECISIONS.md)** — 已被排除的方案、踩過的雷、刻意不做的東西

## 特色

- 大數字全螢幕、`28vw` 自適應字級
- 任意多組警告里程碑（剩餘秒數 + 顏色 + 音效）
- 三段獨立背景顏色（黃 / 橘 / 紅）與配套深色數字
- Web Audio 合成的 `gong` / `bell` / `chime` 三種音效（無 mp3 依賴）
- iPad 首次點擊解鎖音訊 overlay
- Wake Lock 防止 iPad 自動鎖屏
- Tab title 顯示剩餘時間
- 所有設定即時同步進 URL（複製貼上就能在另一台裝置開同樣的計時器）

## 技術棧

- **Vite 6** — 建置與 dev server
- **Vue 3** `<script setup>` + TypeScript
- **Tailwind CSS v4**（CSS-first `@theme` 設計 token）
- **Vitest 4** + jsdom + `@vue/test-utils` — 單元測試
- **GitHub Pages** + GitHub Actions — 部署
- **OpenSpec** — 規格驅動的變更管理

## 專案結構

```
BigTimer/
├── index.html                          # Vite entry
├── mockup.html                         # 視覺設計參考（純 HTML/JS，已凍結）
├── vite.config.ts                      # base: '/BigTimer/' (GitHub Pages subpath)
├── vitest.config.ts                    # jsdom 環境、tests/ 為 include 範圍
├── tsconfig.json
├── package.json
│
├── src/
│   ├── main.ts                         # createApp(App).mount('#app')
│   ├── App.vue                         # 頂層組裝：composable 組合 + 三顆主畫面按鈕 + 面板 backdrop
│   ├── style.css                       # Tailwind 入口、@theme tokens、state-* class、keyframes
│   ├── types.ts                        # Warning / ColorKey / SoundKey / TimerState + COLOR_TO_STATE map
│   ├── vite-env.d.ts                   # Vue SFC 型別宣告
│   │
│   ├── components/
│   │   ├── TimerDisplay.vue            # 全螢幕大數字（顏色隨 state 切換）
│   │   ├── SettingsPanel.vue           # 右側滑入的圓角面板
│   │   ├── WarningCard.vue             # 單一警告里程碑 row（秒數 / 顏色 / 音效 / 刪除）
│   │   ├── ToggleSwitch.vue            # iOS 風 toggle 開關
│   │   ├── SectionTag.vue              # 黃色斜方塊小標籤（MUKJA 風）
│   │   └── AudioUnlockOverlay.vue      # iPad 首次點擊解鎖音訊的全螢幕橘色 overlay
│   │
│   └── composables/
│       ├── useTimer.ts                 # 倒數核心：rAF + endAtMs 計算、status 機、onDone callbacks
│       ├── useMilestones.ts            # 警告觸發判定（去重）+ visualState / activeLabel
│       ├── useAudio.ts                 # AudioContext + Web Audio 合成 gong/bell/chime + 解鎖
│       ├── useUrlSync.ts               # URLSearchParams ↔ 設定 ref 雙向同步（含 parseWarnings / serializeWarnings）
│       ├── useWakeLock.ts              # Screen Wake Lock API（iOS 17+），visibilitychange 重新請求
│       └── useTabTitle.ts              # document.title 隨 status / formatted 更新
│
├── tests/
│   ├── setup.ts                        # 全域 afterEach 還原 timers + mocks
│   └── composables/
│       ├── useUrlSync.test.ts          # T1–T4：parse/serialize/round-trip
│       ├── useTimer.test.ts            # T5–T10：fake timers + RAF 模擬倒數核心
│       ├── useMilestones.test.ts       # T11–T17：警告觸發 + 狀態轉換（含 bug #3 回歸保護）
│       └── integration.test.ts         # T18–T21：duration watcher + repeat 自動重啟
│
├── openspec/changes/add-vitest-tdd/
│   ├── proposal.md                     # 為什麼加單元測試
│   ├── design.md                       # 套件選擇與設計取捨
│   ├── tasks.md                        # 實作清單
│   └── specs/unit-testing/spec.md      # 6 個 Requirement、20 個 Scenario
│
└── .github/workflows/
    └── deploy.yml                      # pnpm test → pnpm build → GitHub Pages
```

## 核心架構：composable 切分原則

每個 composable 只負責一個關注點，彼此用 `Ref` 串接（不互相 import）：

| Composable | 輸入 | 輸出 | 副作用 |
|------------|------|------|--------|
| `useTimer` | — | `status`, `remainSec`, `formatted`, `start/pause/reset/setDuration/onDone` | requestAnimationFrame, Date.now |
| `useMilestones` | `remainSec`, `status`, `warnings`, `onTrigger` | `visualState`, `activeLabel`, `triggered` | — |
| `useAudio` | — | `ensureAudio`, `playSound`, `unlocked` | AudioContext, OscillatorNode |
| `useUrlSync` | 4 個設定 ref | — | URLSearchParams + history.replaceState |
| `useWakeLock` | `status` | — | navigator.wakeLock + visibilitychange |
| `useTabTitle` | `formatted`, `status` | — | document.title |

`App.vue` 是組裝層：建立四個設定 ref（`duration` / `repeat` / `warnings` / `finalSound`），用 composable 把它們接到 timer 行為與 UI 元件上。

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

| 參數 | 範例 | 說明 |
|------|------|------|
| `seconds` | `300` | 倒數秒數 |
| `repeat` | `true` | 結束後自動重啟，預設 false |
| `warn` | `60:orange:bell,30:red:gong` | `<秒>:<顏色>:<音效>`，逗號分隔 |
| `final` | `gong` | 結束音效，預設 `gong` |

完整範例：`?seconds=300&warn=60:yellow:chime,30:orange:bell,10:red:gong&final=gong`

可選值：
- 顏色：`yellow` / `orange` / `red`
- 音效：`chime` / `bell` / `gong`

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

33 個單元測試覆蓋三個純邏輯 composable：

```bash
pnpm test
# Test Files  4 passed
#      Tests  33 passed
#   Duration  ~800ms
```

**測試範圍**：
- ✅ `useUrlSync` — parse / serialize / round-trip 邊界
- ✅ `useTimer` — start / pause / resume / reset / done callbacks
- ✅ `useMilestones` — 警告觸發、去重、狀態轉換（含 bug regression）
- ✅ 整合 — duration watcher + repeat 自動重啟

**不在範圍**（待 E2E 補）：
- ❌ `useAudio` / `useWakeLock` / `useTabTitle` — 副作用過重
- ❌ Vue 元件 visual rendering — 用 Playwright + 截圖比對處理

## 部署

推到 `main` 分支 → GitHub Actions 自動 `pnpm test` → `pnpm build` → 發布到 `https://s1041613.github.io/tickle/`

**啟用 GitHub Pages**：repo Settings → Pages → Source 選 **GitHub Actions**

## OpenSpec 變更管理

`openspec/changes/` 下每個變更包含 `proposal.md`（為什麼）/ `design.md`（怎麼做）/ `specs/<capability>/spec.md`（要求）/ `tasks.md`（步驟）。當前的變更：

- `add-vitest-tdd` — 加入 Vitest 單元測試與 TDD 工作流（已實作）

新增變更：`openspec new change <kebab-name>`
驗證：`openspec validate <change-name>`

## iPad 部署實機注意事項

1. **音訊解鎖**：iOS Safari 嚴格規定音訊只能在 user gesture 內首次播放。`AudioUnlockOverlay` 在進站時要求使用者點一下螢幕，藉此呼叫 `AudioContext.resume()` 解鎖。
2. **Wake Lock**：需 iOS 17+。倒數開始時 `navigator.wakeLock.request('screen')`，切到背景後回前景會自動 re-acquire。
3. **rAF 在背景會停**：這個 app 是現場顯示用，背景倒數不需要精準，故未實作 `setTimeout` fallback。
4. **PWA**：尚未加 manifest，iPad 仍可用 Safari「加到主畫面」當捷徑使用。
