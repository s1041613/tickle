## 為什麼

目前的設定面板能用，但在三個地方既不彈性又視覺吵雜:

1. **倒數時間只能輸入「總秒數」。** 一個 25 分鐘的番茄鐘要打「1500」,使用者必須心算或猜。主畫面的 28vw 大字本來就能顯示 `MM:SS` 或 `HH:MM:SS`,但輸入端卻只給一個整數欄。
2. **警告里程碑不能排序。** 列表照「新增的順序」渲染。如果使用者亂順序新增(先「剩 10 秒」再「剩 30 秒」),唯一的修法是刪掉重加——沒有拖拉排序的視覺提示。
3. **沒辦法在選之前先聽音效。** 在 `chime` / `bell` / `gong` 之間挑只能用猜的;結束音效還有一個文字版的「試聽」,但每個警告里程碑都沒有。更糟的是顏色選項用的是系統 emoji(🟡🟠🔴),跨平台渲染差異很大,而且跟計時器倒數時**實際背景色**(`#FFEBC2` / `#FFD4B8` / `#FFB3B3`,暖杏黃/暖桃橘/淺紅)完全不像。

除了這三個功能缺口,面板還夾了三段說明文字 + 一顆橘色實心 + 大陰影的 CTA,跟整面板柔和米白的風格在打架。經過跟 zoe 多輪 mockup 迭代,最後收斂到「視覺更扁平、不靠文字解釋」的方向。

## 改什麼

- 把「倒數秒數」單一輸入欄,換成**時 / 分 / 秒三欄並排**,下方加一排一鍵套用的預設時長 chip(`1分 / 5分 / 10分 / 15分 / 30分 / 1時`)。
- 警告里程碑卡片左側加 6 點 grip 手把,可以**拖拉排序**。排序變更立刻寫進 warnings 陣列與 URL。
- 每張警告卡片右側加**試聽鈕**(▶ 待機 → ⏸ 播放中,搭配脈動動畫),按下會用既有的 `useAudio.playSound()` 播放該警告的音效。
- 顏色下拉**整顆變色**:選項用實際 state 背景色 + state 文字色渲染,讓「選色」本身就是「倒數時會看到什麼」的即時預覽,完全不需要 emoji。
- 底部 CTA 從「橘色實心 + 大陰影」改成**軟橘底 + 橘字、無陰影**,跟面板的扁平米白風融合。
- 拿掉三段說明文字(基本區段下方的「30秒測試」提示、警告里程碑區段下方的「拖曳/試聽」提示、底部的「URL 同步」說明)——重新設計的圖示自己會說話,文字反而多餘。

## Capabilities

### New Capabilities

- `settings-panel`:使用者面對的設定面板,涵蓋倒數時間輸入、警告里程碑管理(增刪 + 排序 + 試聽)、結束音效選擇、「設定完成」動作。這個 capability 之前沒有單獨命名,被當作 `App.vue` 的一部分組裝。

### Modified Capabilities

<!-- 無。`add-vitest-tdd` 帶來的 `unit-testing` capability 不受本變更影響。本變更會增加新的單元測試檔案,但 unit-testing 的 Requirement 本身沒動到。 -->

## 影響範圍

- **新 runtime 依賴**:可能要加一個輕量拖拉排序套件。候選:`vuedraggable`(壓縮後約 10 kB,Vue 3 相容)或直接用原生 HTML5 DnD 不裝套件。決定寫在 `design.md`。
- **修改的檔案**:
  - `src/components/SettingsPanel.vue`——三欄 HMS 輸入、chip 列、區段重新排版
  - `src/components/WarningCard.vue`——6 欄 grid,含 grip + tinted 顏色下拉 + 試聽鈕
  - `src/composables/useUrlSync.ts`——URL schema 不變,但 `warnings` 陣列要依「使用者排序後的順序」序列化
  - `src/types.ts`——可能新增 `WarningColorClass` 常數(如果把「`color-yellow` / `color-orange` / `color-red`」這三個 tinted-select CSS class 名統一管理)
  - `src/style.css`——新增 `.warn-select.color-yellow|orange|red` 三組 token CSS,沿用既有的 `--color-warn-*-bg` / `--color-warn-*-text`,**不引入新色 token**
  - `src/composables/useAudio.ts`——不動(試聽鈕只是呼叫既有的 `playSound`)
- **新檔案**:
  - `src/composables/useDurationHms.ts`——純函式,把 `number` 跟 `{h, m, s}` 雙向轉換,給新的 HMS 輸入用
  - `src/components/DurationHmsInput.vue`——抽出來的三欄輸入元件(將來若要讓警告秒數也支援 HMS 可以重用)
  - `tests/composables/useDurationHms.test.ts`——新 helper 的 round-trip 與邊界測試
- **URL 參數格式**:**不變**。`?seconds=N&warn=...&final=...&repeat=...` 繼續可用。「seconds 可能由 HMS 輸入而來」純粹是 UI 層的事。
- **對既有測試無回歸風險**:`tests/composables/` 33 個既有測試守的是 composable 的契約,本變更沒打破任何一個契約。
- **Mockup**:`mockups/settings-panel-v2.html` 是本變更的視覺定案。
