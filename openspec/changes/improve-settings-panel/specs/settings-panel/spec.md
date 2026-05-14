## ADDED Requirements

### Requirement: 倒數時間以時 / 分 / 秒三個獨立欄位輸入

設定面板 SHALL 提供時、分、秒三個獨立的數字欄位作為倒數時間輸入,任一欄變動時 SHALL 即時更新底層 `duration: number`(秒數)ref。

#### Scenario: 改分鐘欄會更新 duration
- **WHEN** 使用者把分欄從 `5` 改成 `10`,時=0、秒=0
- **THEN** 面板 emit `update:duration` 帶值 `600`
- **AND** 主畫面顯示 `10:00`(假設 timer 在 idle 狀態)

#### Scenario: 在時欄輸入非零值會更新 duration
- **WHEN** 使用者在時欄輸入 `1`,分=30、秒=0
- **THEN** emit `update:duration` 帶值 `5400`

#### Scenario: 每個欄位有範圍上限
- **WHEN** 使用者在分欄輸入 `99`
- **THEN** 欄位 clamp 成 `59`
- **AND** 秒欄行為相同(上限 `59`)
- **AND** 時欄上限是 `23`

#### Scenario: 三欄都歸零是允許的輸入
- **WHEN** 使用者把三欄都清成 `0`
- **THEN** emit `update:duration` 帶值 `0`
- **AND** 是否能 `start()` 由 `useTimer` 內部的驗證決定(spec 不管)

### Requirement: 預設時長 chip 一鍵套用常用秒數

設定面板 SHALL 在 HMS 輸入下方顯示一排預設時長 chip,點擊任一 chip SHALL 把 `duration` 設為該預設值。

#### Scenario: 點「5 分」會把 duration 設成 300
- **WHEN** 使用者點標籤為「5 分」的 chip
- **THEN** emit `update:duration` 帶值 `300`
- **AND** HMS 輸入顯示 `0` / `5` / `0`

#### Scenario: 符合目前 duration 的 chip 會被高亮
- **WHEN** `duration === 300`
- **THEN**「5 分」chip 進入 active 視覺狀態(`bg-orange` + `text-white`)
- **AND** 其他 chip 不在 active 狀態

#### Scenario: duration 不對應任何 chip 時都不高亮
- **WHEN** `duration === 333`(不在任何預設值中)
- **THEN** 沒有任何 chip 在 active 狀態

### Requirement: 警告里程碑可透過 grip 手把拖拉排序

警告里程碑列表 SHALL 在每張卡片左側渲染一個可拖拉的 grip 手把,拖動卡片 SHALL 重新排序 `warnings: Warning[]` 陣列。

#### Scenario: 把第二張卡拖到第一張上方會重新排序
- **WHEN** warnings 列表是 `[A, B, C]`,使用者把卡片 B 拖到 A 上方
- **THEN** emit `update:warnings` 帶新列表 `[B, A, C]`
- **AND** URL 的 `?warn=...` 反映新順序

#### Scenario: 拖拉中的卡片有抬升視覺
- **WHEN** 使用者開始拖一張警告卡
- **THEN** 該卡片有 `.dragging` class(陰影抬升、輕微 scale、強調色邊框)

#### Scenario: 目標位置會顯示 placeholder
- **WHEN** 拖拉中、滑鼠/手指 hover 在另一張卡片上
- **THEN** 被 hover 的卡片顯示 placeholder 視覺(opacity 降、強調色填底)

#### Scenario: 原地拖放是 no-op
- **WHEN** 使用者拖了一張卡但放在原位
- **THEN** `warnings` 陣列的內容不變(雖然 ref reference 可能變)
- **AND** URL 不會被多寫一次(不產生多餘的 history entry)

### Requirement: 每張警告卡片內嵌音效試聽鈕

每張警告卡片 SHALL 在音效下拉右側顯示試聽鈕,點擊 SHALL 透過 `useAudio.playSound` 播放該警告的音效一次。

#### Scenario: 點試聽鈕播放選定的音效
- **WHEN** 使用者點一張 `sound: 'bell'` 的警告試聽鈕
- **THEN** `playSound('bell')` 被呼叫
- **AND** 按鈕進入播放中視覺狀態(`⏸` 圖示 + pulse-ring 動畫)

#### Scenario: 同時只能有一個試聽
- **WHEN** 試聽 A 在播放,使用者點試聽 B
- **THEN** 試聽 A 的播放中視覺立即停止
- **AND** 試聽 B 進入播放中狀態

#### Scenario: 試聽動畫在音效自然長度後結束
- **WHEN** 試聽動畫已持續 1200 ms(對齊最長合成音效 gong)
- **THEN** 按鈕恢復成待機狀態(`▶` 圖示、無動畫)

### Requirement: 顏色選擇器即時預覽實際警告 state

警告卡片的顏色 `<select>` 在**收合狀態**下 SHALL 用該 state **實際的背景色與文字色**渲染,而**不是**用通用 emoji 標籤。

#### Scenario: color=yellow 的警告顯示暖杏黃
- **WHEN** 一張警告的 `color: 'yellow'`
- **THEN** 顏色 `<select>` 收合狀態的背景是 `#FFEBC2`(暖杏黃)、文字是 `#B07A2A`(暖肉桂棕)
- **AND** 下拉箭頭也是 `#B07A2A`

#### Scenario: color=orange 的警告顯示暖桃橘
- **WHEN** 一張警告的 `color: 'orange'`
- **THEN** 顏色 `<select>` 收合狀態的背景是 `#FFD4B8`、文字是 `#B84A1F`

#### Scenario: color=red 的警告顯示淺紅
- **WHEN** 一張警告的 `color: 'red'`
- **THEN** 顏色 `<select>` 收合狀態的背景是 `#FFB3B3`、文字是 `#C42028`

#### Scenario: 換顏色後預覽立即更新
- **WHEN** 使用者把一張警告的顏色從黃改成紅
- **THEN** 收合狀態的 `<select>` 立即重繪為紅 state(同一個 Vue tick 內)——不需手動 refresh

### Requirement: 「設定完成」CTA 對齊柔和米白風格

面板底部的「✓ 設定完成」按鈕 SHALL 用軟橘底 + 橘字渲染、無陰影,並維持 Apple HIG 44pt 最小觸控目標。

#### Scenario: 按鈕用柔和樣式
- **WHEN** 設定面板開啟
- **THEN** CTA 的 `background: #FFE3D6`(orange-soft)、`color: #FF6B3D`(orange)
- **AND** 沒有 `box-shadow`

#### Scenario: 按鈕高度至少 44pt
- **WHEN** 面板在預設縮放下渲染
- **THEN** CTA 的渲染高度 ≥ 44 CSS px(Apple HIG 最小觸控目標)

#### Scenario: hover 加深背景
- **WHEN** 使用者 hover CTA
- **THEN** 背景變成 `#FFD4BC`(較深的桃色)

### Requirement: 面板不夾帶多餘提示文字

重新設計的面板 SHALL NOT 在三個特定位置出現解釋型文字:倒數輸入下方、警告里程碑區段標題下方、面板底部的 URL 同步提示。

#### Scenario: 倒數輸入下方沒有提示段落
- **WHEN** 面板渲染
- **THEN** 預設 chip 列跟「時間到後循環」toggle 之間沒有任何 `.field-hint` 元素

#### Scenario: 警告里程碑 section tag 下方沒有提示段落
- **WHEN** 面板渲染
- **THEN** 不存在類似「拖曳左側 ⋮⋮ 可調整觸發順序...」的段落

#### Scenario: 面板底部沒有 URL 同步提示橫幅
- **WHEN** 面板渲染
- **THEN** 不存在 `.panel-foot-hint` 元素 / 「所有設定都會即時寫進網址...」訊息

### Requirement: `useDurationHms` composable 提供秒數與時分秒的雙向轉換

程式庫 SHALL 提供一個 composable,接收一個代表「總秒數」的 `Ref<number>`,輸出對應的 `h / m / s` 拆分與 `setHms` setter,且可獨立 import 給單元測試使用。

#### Scenario: 整數值的 HMS 拆分
- **WHEN** 呼叫 `useDurationHms(ref(3661))`
- **THEN** `h.value === 1`、`m.value === 1`、`s.value === 1`

#### Scenario: 0 秒的 HMS 拆分
- **WHEN** 呼叫 `useDurationHms(ref(0))`
- **THEN** `h.value === 0`、`m.value === 0`、`s.value === 0`

#### Scenario: setHms 會寫回底層 ref
- **WHEN** 對 `useDurationHms(ref(0))` 呼叫 `setHms({ h: 2, m: 30, s: 0 })`
- **THEN** 底層 ref 的 value 變成 `9000`

#### Scenario: round-trip 穩定
- **WHEN** 整數 `N`(`0 ≤ N ≤ 86399`)從 ref 拆解成 `{h, m, s}` 後再透過 `setHms` 寫回
- **THEN** 讀 ref 拿到原本的 `N`

#### Scenario: 負值或 NaN clamp 成 0
- **WHEN** 呼叫 `setHms({ h: -5, m: 0, s: 0 })`
- **THEN** ref 的 value 是 `0`,不是負數

### Requirement: URL 參數格式不變

新的 HMS 輸入、拖拉排序、試聽功能 SHALL NOT 改變 URL 參數 schema。URL SHALL 繼續使用 `?seconds=N`(整數秒)表示倒數時間、`?warn=N:color:sound,...` 表示警告、`?final=sound` 表示結束音效、`?repeat=true|false` 表示循環。

#### Scenario: HMS 輸入把 seconds 寫成整數
- **WHEN** 使用者在 HMS 輸入 `1` / `30` / `0`
- **THEN** URL 中 `seconds=5400`(不是 `1h30m0s` 或其他格式)

#### Scenario: 排序後的警告依新順序序列化
- **WHEN** 警告從 `[60:y:bell, 30:o:bell]` reorder 成 `[30:o:bell, 60:y:bell]`
- **THEN** URL 的 `warn` 參數變成 `30:orange:bell,60:yellow:bell`

#### Scenario: 舊版 URL 仍可載入
- **WHEN** 一個本變更前產生的 URL(例如 `?seconds=300&warn=60:orange:bell,30:red:gong&final=gong`)被開啟
- **THEN** 面板顯示同樣的設定:duration=300s 在 HMS 輸入呈現為 0 時 / 5 分 / 0 秒、兩個警告依列出順序顯示
