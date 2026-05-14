# Decisions & Context

這份文件記錄 README 沒寫的設計脈絡：**已被排除的選項、踩過的雷、刻意不做的東西**。

新一輪開發前先掃一遍，避免繞回頭路。

---

## 1. 已被評估與排除的方案

### URL 設定儲存：為什麼用明碼參數而非 hash + 壓縮？

| 方案 | 為何不選 |
|------|---------|
| localStorage + 短代碼（`?p=a3f2`）| 跨裝置不工作。zoe 的核心情境是「電腦設定 → 丟 URL 到 iPad」，localStorage 在 iPad 沒對應資料 |
| hash + LZ-string 壓縮（`#xxx`）| MVP 階段過度工程化。預期警告里程碑數量少（2-3 組），明碼 URL 約 80-100 字元、夠用 |
| 後端 preset 服務 | 純前端應用，不引入 backend |

**目前的明碼方案**只有「URL 變長」一個缺點。當你開始用 5+ 個警告或自訂 hex 顏色時，再考慮升級到 hash + 壓縮（漸進式增強，不需重寫）。

---

### 部署：為什麼選 GitHub Pages 而不是 Vercel？

兩個都試過考慮，最終選 GitHub Pages：

| 比較項 | GitHub Pages | Vercel |
|--------|--------------|--------|
| 費用 | **完全免費**（無「Hobby plan 額度」概念） | 個人專案免費，商業用會被擋 |
| SPA fallback | 需要 hack | `vercel.json` 一行 |
| 部署速度 | 1-2 分鐘 | ~30 秒 |
| 設定複雜度 | 配 GitHub Actions workflow | 一鍵連 repo |

**選 Pages 的決定性原因**：本專案 URL 永遠是 `?seconds=...&warn=...` 這種「root path + query string」，**不會遇到 SPA fallback 的 404 問題**，Vercel 的優勢用不到。

---

### 音效：為什麼自合成 Web Audio 而不是用 mp3 檔？

bigtimer.net 用 `Gong.mp3` + `Tick.mp3` 兩個檔案。我們不用它：

1. **零外部資源** — bundle 體積保持小，沒有額外 HTTP request
2. **避免版權問題** — 直接打包別人的 mp3 在公開部署有疑慮
3. **一致性** — 全部音效都從 OscillatorNode 合成，邏輯統一
4. **iPad Safari 對 `<audio>` 元素的處理比 Web Audio 更不穩定**

代價：合成的 gong 不如真實鑼聲飽滿。實際使用後評估，如果聲音太單薄再考慮包小體積 mp3。

---

### CSS：為什麼用 Tailwind v4 而不是 v3？

v4 改用 CSS-first 設定，所有 design token 直接在 CSS 裡 `@theme` 宣告。**完美對應 mockup 已有的 `:root { --orange: #FF6B3D }` 風格**，遷移成本近零。

如果你看到 Tailwind v3 的舊範例（`tailwind.config.js` 那種），**不要照抄**，這個專案沒有 `tailwind.config.js`。

---

### 測試：為什麼用 Vitest 而不是 Jest？

Vitest 跟 Vite 共用 transform pipeline，TypeScript 解析、Vue SFC 處理、module alias 全部複用 `vite.config.ts`。Jest 需要另外設 ts-jest + @vue/vue3-jest，配置成本高一倍。

---

## 2. 已踩過的雷（不要再重蹈覆轍）

### Bug #1：試聽音效失效（AudioContext 卡 suspended）

**現象**：使用者點「▶ 試聽」沒聲音。
**原因**：`AudioContext` 一進站就建立、處於 suspended 狀態，要 user gesture 內 `resume()` 才解鎖。但「試聽」按鈕雖然是 user gesture，沒呼叫 resume。
**修法**：在 `playSound()` 開頭也呼叫 `ctx.resume()`（雙保險，AudioUnlockOverlay 沒蓋到的入口都會解鎖）。
**位置**：`src/composables/useAudio.ts`

---

### Bug #2：設定按鈕在 done 狀態看不到字（Tailwind class 衝突）

**現象**：時間到時，「設定」按鈕變成空白白圓。
**原因**：基底 class 寫 `bg-orange text-white`，條件 class 又寫 `bg-white text-orange`。**Tailwind 沒有 specificity 邏輯，兩個 class 並存時看 CSS source order**——結果 `text-white` 贏 `text-orange`，字白色配白底看不到。
**修法**：用 `:class="state === 'done' ? 'A' : 'B'"` 三元運算子，**兩個狀態互斥不能並存**。
**教訓**：**不要在 `class="..."` 寫基底色 + `:class="{ ... }"` 寫條件色**，永遠用三元互斥。

---

### Bug #3：「再來一次」後背景脈動沒停（done → idle → running 連續轉換）

**現象**：時間到後按「▶ 再來一次」，背景的橘色脈動動畫繼續、不會停。
**原因**：`useMilestones.ts` 的 `watch(status)` 只在「狀態變 idle」清空 visualState。但 restart 是 `done → idle → running` 連續兩次轉換，**Vue 的 watch 在 flush 時可能合併**，第一次 idle 的清理被吞掉。
**修法**：對 `running` 狀態的進入也明確檢查 `prev === 'idle' || prev === 'done'` 並重設 visualState/triggered。
**回歸測試**：`useMilestones.test.ts` T15 專門守這個轉換。
**位置**：`src/composables/useMilestones.ts`

---

### Bug #4：改 duration 不會即時反映到主畫面

**現象**：在設定面板把秒數從 300 改 30，主畫面數字還是 `05:00`。
**原因**：`duration` ref 改變了，但 `timer.totalSec` / `timer.remainSec` 沒同步——`App.vue` 沒 watch duration。
**修法**：`App.vue` 加 `watch(duration, v => timer.setDuration(v))`，並且只在 `status === 'idle' || 'done'` 才套用（避免倒數中亂跳）。
**位置**：`src/App.vue`

---

### Bug #5：App.vue template 寫 `timer.formatted.value` 是型別錯誤

**現象**：`vue-tsc` 報 `Type 'ComputedRef<string>' is not assignable to type 'string'`。
**原因**：之前以為 Vue template 自動解 ref 就可以寫 `timer.formatted`，但 vue-tsc 嚴格檢查時 ComputedRef 不等於 string。
**修法**：template 內傳給子元件的 prop 要寫 `timer.formatted.value`。
**教訓**：**從 composable 拿出來的 ref/computed，傳給子元件 prop 時都要 `.value`**（template 自動解只在直接渲染 `{{ }}` 內生效）。

---

### Bug #6：中文文字孤字（「音」單獨掉一行）

**現象**：「iPad Safari 規定，必須先點擊一次才能播放警示音」斷成兩行時，「音」字孤獨掉到第三行。
**原因**：中文沒空格，瀏覽器預設 `word-break: normal` 允許每個字之間都斷行。
**修法**：兩道保險——
1. `word-break: keep-all; line-break: strict;` 防止 CJK 詞中斷
2. 主動 `<br>` 切在語意完整處
**位置**：`src/components/AudioUnlockOverlay.vue` + `src/style.css` 的 `.text-balance-cjk` class

---

### Bug #7：色票名 ≠ 實際顏色（黃跟橘看起來一樣）

**現象**：使用者選「🟡 黃色」跟「🟠 橘色」做兩段警告，背景看起來一模一樣。
**原因**：原本 `COLOR_TO_STATE` 把 yellow 跟 orange **都 map 到 `warn-1`**（只有兩段視覺強度）。三色變兩色就有一組重複。
**修法**：拆成 `warn-yellow` / `warn-orange` / `warn-red` 三個獨立 state，背景與數字色各自定義（暖杏黃 / 暖桃橘 / 淺紅）。
**位置**：`src/types.ts` + `src/style.css`
**測試影響**：useMilestones.test.ts T11、T13 用了 `'warn-1'` / `'warn-2'`，改成 `'warn-yellow'` / `'warn-red'`——測試立刻紅了，證明測試保護網有效。

---

### Bug #8：面板開啟時背景 backdrop-blur 讓面板看起來變色

**現象**：「設定面板打開時，面板的白色背景看起來偏淺、偏粉」。
**原因**：`backdrop-filter: blur()` 建立新的合成層（compositing layer），跟上方不透明面板邊緣 anti-aliasing 混色，視覺上面板「沾染」周圍色彩。
**修法**：拿掉 `backdrop-blur-sm`，改用單純的 `bg-black/40` 暗化遮罩。
**教訓**：**`backdrop-blur` 在跨多色背景上用時要謹慎**，模糊效果在邊界容易出問題。
**位置**：`src/App.vue`（panel backdrop div）

---

## 3. 刻意不做的東西（不要熱心補上）

| 功能 | 為什麼不做 |
|------|---------|
| **`target` 絕對時間戳參數**（`?target=1778742900633`） | 之後可加，但 MVP 只支援 `seconds`。需求是「多人同步看同一個倒數結束時刻」 |
| **`autostart` URL 參數** | zoe 明確要求拿掉。使用者就是會手動按開始 |
| **上傳自訂 mp3 音效** | IndexedDB CRUD + 檔案去重 + URL ID 對應太複雜。MVP 用內建三種音效驗證流程 |
| **±1 min 微調按鈕** | 研究過是「展示型計時器」標準功能（TED、Stagetimer 都有），但 MVP 沒做。**之後加分數高** |
| **時長預設 chips（5/10/15/30 分鐘）** | 同上，第二期加。MVP 用面板手動填 |
| **UI 自動隱藏**（3 秒不動淡出） | TED 計時器有的進階功能。iPad 公開展示時很有用，**之後加** |
| **PWA / manifest / 加到主畫面** | MVP 用一般網址。如果使用者真的常用、再 promote 成 PWA |
| **localStorage 偏好記憶** | 整個設計是「URL 包含所有狀態」，加 localStorage 反而會有「URL vs storage 衝突」問題 |
| **元件層 / E2E 測試** | 已計畫但未做，留給 Playwright 補。**單元測試只測 composable** |

---

## 4. 進行中的取捨

### `handlePanelClose` 邏輯沒測試保護

**情況**：在 App.vue 裡的 `handlePanelClose()` 會在 `status === 'done'` 時 reset timer。**這段邏輯沒在 33 個單元測試的覆蓋範圍**——因為它在 App.vue 而非 composable。

**為什麼不補**：
1. 邏輯只有 4 行、改錯風險低
2. 補它要抽 `usePanelControl` composable 才能單元測，**抽出來反而過度設計**
3. 之後做 Playwright E2E 時這個情境會自然被整合測試覆蓋

**何時要補**：如果這段邏輯**真的被改壞過一次**，立刻抽 `usePanelControl` 加單元測試。

---

### 黃/橘/紅 三段顏色不一定要按「升溫」順序

UI 上沒強制檢查警告里程碑的顏色順序。使用者可以設定「剩 60 秒 → 紅色 / 剩 30 秒 → 黃色」這種反邏輯組合。

**為什麼不擋**：尊重使用者的意圖。預設值已經是合理順序（黃 60 → 橘 30 → 紅 10），不需要再強制。

---

### mockup.html 凍結，不要動它

`mockup.html` 是 Vite 重構前的視覺設計參考（純 HTML/CSS/JS，583 行）。它代表了**已被使用者視覺確認過的設計**。如果你想改視覺，**改 Vue 版**，不要動 mockup（也不會反向同步回去）。

它留著的唯一原因：日後有人問「這個面板原本長怎樣」、可以雙擊打開看。

---

## 5. 給「新一輪開發 Claude」的建議

如果你是剛接手這個專案的新會話：

1. **先讀 README.md** 掌握架構
2. **掃這份 DECISIONS.md** 知道哪些路走過了
3. **看 `openspec/changes/add-vitest-tdd/`** 了解測試策略
4. **跑 `pnpm test` 確認 33 個測試還是綠**
5. 開始任何改動前，看一下檔案頂端的 import / `defineProps` / `defineEmits`、再動手

**最常見的失誤模式**：
- 改了 `useMilestones` 的狀態轉換但沒跑測試 → 測試會抓到
- 在 template 寫 `someRef`（沒 `.value`）傳給 `defineProps<{ x: string }>` → vue-tsc 紅
- 加 Tailwind class 跟基底 class 衝突 → 不會報錯但畫面壞
- 改 `COLOR_TO_STATE` 但沒同步改 style.css → 背景變透明

跑 `pnpm test && pnpm build` 雙重保險。
