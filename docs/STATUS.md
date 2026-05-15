# Project Status — 2026-05-15

給接手的新 Claude：這份是**當前最即時的工作交接**，跟 README.md / DECISIONS.md 互補：

- `README.md` = 專案是什麼（穩定文件）
- `docs/DECISIONS.md` = 為什麼這樣做 + 已知雷（穩定文件）
- `docs/STATUS.md`（本文） = **現在進度到哪、下一步做什麼**（會經常變動）

---

## 一句話總結

tickle 已部署到 **https://s1041613.github.io/tickle/**，33 個單元測試全綠，GitHub Actions 自動 deploy 已驗證可用。**尚未在 iPad 實機測試** — 那是下一步。

---

## 整體進度

| 階段 | 狀態 | 備註 |
|------|------|------|
| 設計與 mockup | ✅ 完成 | `mockup.html` 已凍結 |
| Vite + Vue 3 + TS 架構 | ✅ 完成 | 6 元件 + 6 composables |
| Tailwind v4 樣式 | ✅ 完成 | MUKJA 風米白橘 |
| URL 雙向同步 | ✅ 完成 | 4 個參數 |
| Web Audio 三種音效 | ✅ 完成 | gong / bell / chime |
| iPad 音訊解鎖 overlay | ✅ 完成 | 但未實機測過 |
| Wake Lock | ✅ 寫了 | 但未實機測過（iOS 17+ 才有） |
| Tab title 同步剩餘時間 | ✅ 完成 | |
| 桌面 Fullscreen API 全螢幕按鈕 | ✅ 完成 | `useFullscreen` + 右上角 ⛶ 按鈕；iPad feature-detect 自動隱藏 |
| 117 個單元測試 | ✅ 全綠 | useUrlSync / useTimer / useMilestones / useFullscreen / integration |
| GitHub Actions deploy.yml | ✅ 寫了 | 但 repo 還沒 init / push |
| OpenSpec change `add-vitest-tdd` | ✅ 4 個 artifact 都完成 | tasks.md 已更新進度 |
| GitHub Pages 實際部署 | ⏳ 待做 | 需要 git init + push + 開 Pages |
| iPad Safari 實機驗證 | ⏳ 待做 | 部署完才能測 |
| Playwright E2E 測試 | ⏳ 未開始 | 計畫中，下一輪 |

---

## 最近完成（這次對話）

按時間順序：

1. **mockup.html → Vite + Vue 3 + TS 重構**
   - 拆成 6 個 Vue 元件 + 6 個 composables
   - 全程用 Tailwind v4 `@theme` token，視覺保留 MUKJA 風

2. **加入完整 URL 雙向同步、Wake Lock、Tab title**
   - 4 個 URL 參數：`seconds` / `repeat` / `warn` / `final`
   - 註：`autostart` 與 `target` 故意拿掉（見 DECISIONS.md）

3. **互動細節打磨**（多輪 user feedback）
   - 移除大數字下的 label（「準備倒數」等）
   - 移除底部 status pill（「待機中」）
   - 主畫面按鈕從 3 顆精簡到 2 顆（智慧切換主按鈕 + ⚙）
   - 暫停時才出現第 3 顆 ↻ 按鈕
   - 「再來一次」改為自動 reset + start
   - 「設定完成」按下後若 timer 處於 done 會自動 reset 回 idle
   - 設定面板加 black/40 backdrop（不用 backdrop-blur 避免色彩合成 bug）
   - done 狀態打開面板時 pulse 動畫暫停
   - 三個警告顏色獨立（黃 / 橘 / 紅）各自背景與數字色

4. **Vitest TDD 建設**
   - 安裝 `vitest @vitest/ui @vue/test-utils jsdom`
   - 設定 vitest.config.ts + tests/setup.ts
   - `parseWarnings` / `serializeWarnings` 改 export 讓測試可呼叫
   - 33 個測試（4 個檔案）全綠
   - 含 5 個 bug 的回歸保護

5. **OpenSpec change `add-vitest-tdd`**
   - 4 個 artifact 全寫完並 `openspec validate` 通過
   - tasks.md 8 大組任務全部勾選（除了「實際推 GitHub PR 跑 Actions」與 coverage 報告）

6. **文件**
   - 更新 README.md：架構圖、composable 切分表、視覺狀態機表
   - 新增 docs/DECISIONS.md：8 個 bug 詳記 + 已排除方案 + 刻意不做的東西
   - 新增 docs/STATUS.md（本文）

---

## 已知未解問題 / 技術債

### 1. `handlePanelClose` 沒測試保護
**位置**：`src/App.vue`
**狀況**：「設定面板關閉時若 timer 是 done 狀態就 reset」這段邏輯只有 4 行，但寫在 App.vue 裡，目前的單元測試不會涵蓋。**刻意先不抽 composable**，等被改壞過再說。

### 2. iPad 實機未測
**狀況**：所有 iPad 相關特性（音訊解鎖 overlay、Wake Lock、Tab title 在背景的行為、Apple 觸控反應）都只在桌面 Chrome / Safari 開發者測過。實機可能踩到：
- Wake Lock 在某些 iPadOS 版本可能 silent fail（未拋例外但沒鎖屏）
- 音訊在背景 tab 突然結束時可能播不出
- `28vw` 字級在某些 iPad 比例可能溢出邊界
**下一步**：部署到 GitHub Pages 後立刻在 iPad Safari 開實際 URL 測一輪。

### 3. Coverage 報告未跑
**狀況**：tasks.md 8.2 計畫跑 `pnpm test --coverage` 確認三個 composable ≥ 80%，但沒裝 `@vitest/coverage-v8`。
**該裝嗎**：如果 coverage 變成驗收標準才裝；目前 33 測試覆蓋已經很實用，不裝也行。

### 4. 還沒 git init / 沒 GitHub repo
**狀況**：整個專案還在本地端，沒進版本控制。GitHub Actions workflow 寫了但沒地方跑。
**下一步**：`git init` → 第一次 commit → 建 GitHub repo → push → 開 Pages 設定。

### 5. Playwright E2E 計畫未開始
**狀況**：DECISIONS.md 提過「Vue 元件 visual rendering、Tailwind class 衝突 bug、handlePanelClose 邏輯」等等是 E2E 才能保護的範圍。
**下一步**：等部署完、iPad 實機測過、確認核心穩定後，再開一個 OpenSpec change `add-playwright-e2e`。

---

## 下一步建議路線

按優先級排：

### 路線 A：先部署、實機驗證（推薦）
1. `git init` + 寫 `.gitignore`（已有）+ 第一次 commit
2. GitHub 建 repo `tickle`、push
3. 在 repo Settings → Pages → Source 選 GitHub Actions
4. push 觸發 Actions 跑 test → build → deploy
5. 拿到 `https://s1041613.github.io/tickle/` URL
6. iPad Safari 開、測完整流程：解鎖音訊 → 設定 → 倒數 → 警告 → 結束
7. 把發現的問題回頭修 + 加測試

**為什麼推薦**：先驗證「真實使用情境能不能跑」，再決定下一步。可能會發現意外的 iPad 行為，現在投入 E2E 太早。

### 路線 B：補進階功能再部署
- 加 `target` 絕對時間戳參數（多人同步用）
- 加 ±1 min 微調按鈕（演講常用）
- 加時長預設 chips（5/10/15/30 分鐘一鍵切）
- 然後再部署

**缺點**：核心可能根本還沒在 iPad 上跑得通，先加功能可能浪費。

### 路線 C：先補 Playwright E2E
- 寫元件層測試補上 Tailwind class 衝突、面板開關邏輯
- 然後再部署

**缺點**：UI 還在快速迭代，E2E 容易失效。等視覺穩定後再做更划算。

---

## 開工前 30 秒檢查清單

新 Claude 接手時，跑一遍這些確認狀態：

```bash
cd /Users/zoe/Documents/Claude/Projects/BigTimer
pnpm test      # 預期：33 passed
pnpm build     # 預期：成功，無 vue-tsc 錯誤
pnpm dev       # 開 http://localhost:5173/tickle/ 確認畫面
openspec validate add-vitest-tdd  # 預期：valid
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
