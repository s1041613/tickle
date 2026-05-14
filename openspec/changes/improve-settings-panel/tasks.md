## 1. 純 composable:HMS 轉換

- [x] 1.1 建立 `src/composables/useDurationHms.ts`,export `useDurationHms(seconds: Ref<number>)`
- [x] 1.2 回傳 `{ h, m, s, setHms }`(規格見 design.md)
- [x] 1.3 寫 `tests/composables/useDurationHms.test.ts`
- [x] 1.4 測試:`useDurationHms(ref(0))` → `h=0, m=0, s=0`
- [x] 1.5 測試:`useDurationHms(ref(3661))` → `h=1, m=1, s=1`
- [x] 1.6 測試:`setHms({h:2, m:30, s:0})` → 底層 ref 變成 9000
- [x] 1.7 測試:`x ∈ {0, 59, 60, 3599, 3600, 36000}` 的 round-trip `setHms(x) → {h,m,s}` 與 x 互為逆運算
- [x] 1.8 測試:`setHms` 收到負值或 NaN 時 clamp 成 0(防呆,保持 ref 是合法 `number`)

## 2. 新元件:DurationHmsInput

- [x] 2.1 建立 `src/components/DurationHmsInput.vue`
- [x] 2.2 Props:`modelValue: number`(秒數);Emits:`'update:modelValue': [v: number]`
- [x] 2.3 Template:三個 `<input type="number">`,`min="0"`,時欄 `max="23"`、分/秒欄 `max="59"`
- [x] 2.4 每欄下方一個單位 label(時 / 分 / 秒),用既有 `--color-muted`
- [x] 2.5 套用 `.hms-cell` 樣式(focus 時邊框 `--color-orange`、底色變白)——mockup 已有
- [x] 2.6 用 `useDurationHms` 接(composable 是 h/m/s 拆分的 source of truth)
- [x] 2.7 去除前導零顯示,但值為 0 時要顯示 `0`(不留空)

## 3. 預設時長 chip

- [x] 3.1 在 `SettingsPanel.vue` 的 HMS 輸入下方加一排 `<button class="chip">`
- [x] 3.2 寫死預設值:`[60, 300, 600, 900, 1800, 3600]`(秒)
- [x] 3.3 標籤:`1 分 / 5 分 / 10 分 / 15 分 / 30 分 / 1 時`
- [x] 3.4 用 computed `activePreset` 高亮目前 `duration` 對應的 chip
- [x] 3.5 點 chip 時 emit `update:duration` 帶入該秒數

## 4. WarningCard:grip + tinted 顏色下拉 + 試聽鈕

- [x] 4.1 把 `WarningCard.vue` 改成 6 欄 grid:`22px 64px 1fr 1fr 34px 30px`(grip / 秒數 / 顏色 / 音效 / 試聽 / 刪除)
- [x] 4.2 加 `.grip` 元素,內含 6 點 SVG;`cursor: grab`;hover 變 `--color-orange`
- [x] 4.3 顏色 `<select>` 依 `warning.color` 套用 `.color-yellow / -orange / -red` 其中一個 class
- [x] 4.4 在 `src/style.css` 定義這三個 class,用既有 `--color-warn-{yellow,orange,red}-{bg,text}` 變數,**不新增色 token**
- [x] 4.5 加試聽鈕:34×34 圓形,`▶` 待機 / `⏸` 播放中
- [x] 4.6 試聽鈕 emit `'preview'` 事件,帶該 warning 的 `sound`
- [x] 4.7 `SettingsPanel.vue` 收到 `preview` 後呼叫注入進來的 `playSound`
- [x] 4.8 在 `SettingsPanel.vue` 用 `playingId` ref 追蹤,同時間只有一顆按鈕顯示播放中
- [x] 4.9 試聽動畫持續 1.2 秒(對齊最長合成音效 gong 的時長)後復原

## 5. 拖拉排序警告里程碑

- [x] 5.1 `.warn-card` 加 `draggable="true"`,但要擋掉輸入框跟下拉本身的原生 drag(用 `pointer-events` 或在 `dragstart` 檢查 `event.target`)
- [x] 5.2 處理 `dragstart`:`dataTransfer.setData('warning-id', String(id))`,加 `.dragging` class
- [x] 5.3 處理 `dragover`:在被 hover 的卡片上加 `.drag-placeholder` 提示
- [x] 5.4 處理 `drop`:依位置算出新 index,reorder `warnings` 陣列,emit `update:warnings`
- [x] 5.5 處理 `dragend`:清掉所有 `.dragging` 與 `.drag-placeholder`
- [x] 5.6 確認 reorder 後的 warnings 用新順序寫進 URL(`useUrlSync` 本來就 watch 整個陣列,不用改)
- [x] 5.7 先在桌面 Chrome + Safari 測過;iPad Safari 驗證放在第 8 大組

## 6. 視覺清理(對齊 mockup)

- [x] 6.1 軟化「✓ 設定完成」按鈕:`bg-orange-soft`、`text-orange`、`padding: 0.85rem`、無陰影、`font-weight: 700`
- [x] 6.2 刪掉 HMS 輸入下方的 `.field-hint`(「設定 30 秒可快速測試...」那段)
- [x] 6.3 刪掉「警告里程碑」section tag 下方的 `.field-hint`(「拖曳左側...」那段)
- [x] 6.4 刪掉面板底部的 `.panel-foot-hint`(「所有設定都會即時寫進網址...」那段)
- [x] 6.5 在 dev server 上跟 `mockups/settings-panel-v2.html` 視覺比對,每個區段誤差 ≤ 4px

## 7. 結束音效區段:試聽鈕對齊警告卡片

- [x] 7.1 把既有的「▶ 試聽」文字連結換成 34×34 圓形試聽鈕(樣式跟警告卡片同步)
- [x] 7.2 重用 `playingId` 機制(用 `'final'` 當 sentinel id),確保同時間只有一個試聽在播

## 8. 驗證

- [x] 8.1 跑 `pnpm test`——既有 33 個測試仍綠 + `useDurationHms` 新測試也綠
- [x] 8.2 跑 `pnpm build`——`vue-tsc` 通過
- [ ] 8.3 桌面手動測:打開面板,操作 HMS 輸入 + chip 預設 + 拖拉排序 + 試聽 + 新 CTA
- [ ] 8.4 iPad Safari 實機測:同上流程(這步會暴露原生 DnD 在 iPad 的相容性問題)
- [ ] 8.5 確認 reorder、HMS 編輯、chip 點擊後 URL 都正確更新
- [x] 8.6 跑 `openspec validate improve-settings-panel`——change 格式正確
