## 背景

目前的 `SettingsPanel.vue` 大概 200 行,template + script 把三個區段(基本 / 警告里程碑 / 結束音效)直接組裝在同一個 SFC 裡。`docs/DECISIONS.md` 提過,本來不抽 composable 的考量是「邏輯只有 4 行 `handlePanelClose`」——但這次要加 HMS 轉換、拖拉排序、每張卡片試聽,複雜度上來了,該抽就抽。

視覺定案在 `mockups/settings-panel-v2.html`。本文件記錄**為什麼選這些技術做法**,不是描述 mockup 長怎樣。

## 目標 / 不做的事

**目標:**

- 忠實實作鎖定的 mockup:三欄 HMS 輸入、預設 chip、grip 手把、tinted 顏色下拉、每張卡試聽鈕、軟橘 CTA、零提示文字
- URL 參數格式**逐 byte 不變**——不用做遷移、不會打破現有貼上的 URL
- 純邏輯(HMS 轉換、warnings 陣列的 reorder)抽進 composable,可以用 Vitest 跟既有的 `useUrlSync` / `useTimer` / `useMilestones` 同一套測試框架測
- 視覺狀態機完全不動:既有的 `state-warn-yellow / -orange / -red` body CSS class 繼續驅動全螢幕倒數時的顏色

**不做:**

- 警告里程碑的「秒數欄」改成 HMS。警告通常 ≤ 60 秒,三欄反而擠;單一整數欄留著
- 自訂上傳 mp3 音效(`DECISIONS.md` 第 3 節已決定先不做)
- `target` 絕對時間戳 URL 參數(仍延後)
- ±1 分鐘微調按鈕(延後——預設 chip 已經涵蓋類似需求)
- 觸控長按拖拉。NN/g 跟 PatternFly 都說可見的 grip 比長按更好發現,iPad Safari 用 grip 就夠

## 決定

### 三欄獨立 HMS,不是單一 `HH:MM:SS` 遮罩輸入框

- mockup 明確選了三個 `<input type="number">` 並排
- `<input type="time" step="1">` 考慮過,但 iPad 的 OS-level 時間選取器 UI 沒辦法 style 成米白風格,而且最大只到 23 小時
- 單一 `HH:MM:SS` 遮罩需要自製游標、自動 tab 邏輯,程式碼更多,iPad 數字鍵盤輸入體驗也更糟
- *考慮過但拒絕的方案:* 只有「分 + 秒」(砍掉時)。1 小時演講是真實情境,多一欄成本很低

### 預設 chip,不是預設下拉

- 6 顆 pill 能在一行內排完,「點一下套用」的視覺暗示很明確
- 當 `duration` 剛好等於某個預設值(`5 * 60` / `30 * 60` ...)時可以高亮對應的 chip
- *考慮過但拒絕的方案:* 用一樣選項的 `<select>`。在 iPad 上要兩次點(展開 → 選)+ 滾動,比較慢、視覺也比較重

### 拖拉排序:原生 HTML5 DnD,不裝套件

- 三個理由:
  1. 列表通常 2–5 筆,性能完全不是問題
  2. 最小體面的 `vuedraggable` 也有 ~10 kB(gz),為這點功能加 runtime 依賴不值得
  3. grip + 視覺回饋(`.dragging` class、placeholder 列)在 `SettingsPanel.vue` 裡用 ~50 行 script 就搞定
- 做法:`.warn-card` 設 `draggable="true"`,綁 `dragstart` / `dragover` / `dragleave` / `drop`。`dataTransfer` 載入的就是 warning 的 `id`
- *考慮過但拒絕的方案:* `vuedraggable`。留作後備——若 iPad Safari 實機測試發現原生 DnD 不穩,再另開一個 change 換掉

### Tinted 顏色下拉用 CSS class,不用 inline style

- 維持原本三個 `<option>`,但在 `<select>` 加 `.color-yellow / -orange / -red` 的其中一個,**對應「目前選的」**那個顏色
- 這個只控制**收合狀態**的外觀——**展開狀態**的選項列表是 OS 自己畫的,我們無法 style。可接受的取捨:99% 時間下拉是收合的,而展開時的「黃 / 橘 / 紅」純文字標籤本身就清楚
- 下拉箭頭用內嵌 SVG data URI,顏色寫進 SVG fill,讓箭頭也跟著 state 文字色變(mockup 已驗證)
- *考慮過但拒絕的方案:* 全自製 `<div>` 假下拉。程式碼至少多兩倍、無障礙風險也多。如果使用者反映收合狀態的預覽不夠用再重新考慮

### 試聽鈕呼叫既有的 `useAudio.playSound`

- `useAudio` 已經實作 `gong / bell / chime` 合成,也處理過 AudioContext unlock。試聽鈕純粹是新的 UI 入口
- 按鈕在 `▶`(待機)和 `⏸`(播放中 + pulse-ring 動畫)之間切換,用一個 `playingId` ref(keyed by warning id)同時間只允許一個試聽
- *考慮過但拒絕的方案:* 預先 buffer 音訊、按一下 resume。合成成本很低(單一 OscillatorNode),每次 fresh 合成也比較貼近實際倒數時的行為

### 抽 `useDurationHms` composable

```ts
// src/composables/useDurationHms.ts
export function useDurationHms(seconds: Ref<number>) {
  const h = computed(() => Math.floor(seconds.value / 3600))
  const m = computed(() => Math.floor((seconds.value % 3600) / 60))
  const s = computed(() => seconds.value % 60)
  function setHms(next: { h: number; m: number; s: number }) {
    seconds.value = next.h * 3600 + next.m * 60 + next.s
  }
  return { h, m, s, setHms }
}
```

- 純函式、無副作用,單元測試成本極低
- 如果之後要讓警告秒數也支援 HMS,這個 composable 直接重用——成本很低的保險

### 抽 `DurationHmsInput.vue` 元件

- 三個 input + 三個單位 label 已經夠多 markup,值得獨立成 SFC
- `SettingsPanel.vue` 會瘦身;HMS layout 變成可重用元件

### CTA 視覺:軟橘扁平(`#FFE3D6` 底 + `#FF6B3D` 字、padding 0.85rem、無陰影)

- 仍滿足 Apple HIG 44pt 最小觸控目標(0.85rem × 2 + ~1rem 字 ≈ 44px 高)
- 底部單顆按鈕、滿寬,符合 Carbon 的「主 CTA 在流程結尾」與 Adobe Commerce slideout「擴充表單動作叫 Done / 完成」的建議
- *考慮過但拒絕的方案:* 右對齊 pill(對話框 OK 鈕風格)。zoe 否決——滿寬比較符合面板的垂直韻律

### 拿掉所有提示文字

- zoe 在 mockup 階段的原話:「良好的 UI 不需要文字解釋」
- grip icon、▶ 鈕、`?warn=...` URL 行為都是不證自明或是 power user 才會用的特性。底部那段「URL syncs to all devices」是好奇心引導,但不是必要
- 之後若實機 iPad 使用者測試出現困惑,再加回來

## 風險 / 取捨

- **[風險]** 原生 HTML5 DnD 在 iPad Safari 歷史上比 `vuedraggable` 的觸控 shim 不穩 → **緩解:** 把 iPad 實機測試列為驗證任務(task 6.4)。若壞掉,改裝 `vuedraggable@next`,既有的 `.dragging` CSS 一行不動就能繼續用
- **[風險]** OS 渲染的 `<option>` 展開列表只有「黃 / 橘 / 紅」純文字,沒有顏色——tinted 預覽只在收合時生效 → **緩解:** 接受。文字標籤本身夠清楚,收合狀態的預覽才是主要 affordance。如果使用者抱怨再做自製下拉
- **[風險]** 全砍提示文字可能會讓新使用者卡住 → **緩解:** 可接受。BigTimer 的目標使用者就是一個 power user(zoe),設定一次後用 URL 重用。如果真的有外部使用者抱怨再另開 change 加回提示
- **[取捨]** 三欄 HMS 表示有 3 個 focusable 輸入要切換,vs. 單一遮罩欄 → **緩解:** Apple Clock / iOS 倒數計時器都是這個樣子,使用者熟悉
- **[取捨]** 觸控長按沒有 fallback,只能用 grip。觸控使用者要精準點到 grip → **緩解:** 接受。主要目標裝置是 iPad + 滑鼠/觸控板,或精準觸控 grip
- **[取捨]** Tinted-select 的收合預覽要三個 CSS class(一個顏色一個)。將來加第四個 state 是三處改動 → **緩解:** 寫成用 CSS token 變數驅動,「加一個顏色 = style.css 加一個區塊」,邏輯零改動
