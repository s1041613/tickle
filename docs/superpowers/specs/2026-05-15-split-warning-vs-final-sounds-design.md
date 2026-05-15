# 區分警告音效與結束音效

## 背景

目前 `SoundKey` 共有六種：`chime` / `bell` / `gong` / `polite` / `cheer` / `drumGong`。在 SettingsPanel 的下拉選單中，警告里程碑（WarningCard）與結束音效都列出全部六個選項。

但實際上 `polite` / `cheer` / `drumGong` 三個音效長度較長（兩三秒以上的真實錄音 / 多層 buffer），語意上不適合做為「警告」用途——警告音效應該短促、可重複觸發；長音效只適合做為「結束」時的一次性大收尾。

## 目標

警告里程碑的音效下拉選單**只列出短音效**（`chime` / `bell` / `gong`），結束音效保留全部六種選項。

## 非目標

- **不改 URL parser**：`useUrlSync.ts` 仍接受任意合法 `SoundKey`。若有人手動編輯 URL 帶入 `?warn=60:red:cheer`，會被忠實還原到設定中（使用者可在 UI 自行調整）。
- **不做 migration / fallback**：沒有歷史使用者，無需在載入時把不合法組合自動改寫。
- **不改 type 系統**：不引入 `WarningSoundKey` 子型別。runtime 限制（下拉選單只列短音效）已足夠。
- **不改現有測試**：`useUrlSync.test.ts` 中 T3d / T4b 驗證 parser 接受 `polite` / `cheer` 的測試保持原樣。

## 設計

### 短音效 vs 長音效

| 類別 | 成員 | 用途 |
|------|------|------|
| 短音效 | `chime`、`bell`、`gong` | 警告 + 結束皆可 |
| 長音效 | `polite`、`cheer`、`drumGong` | 僅結束 |

### 改動點

**1. `src/types.ts`**

新增兩個常數，明確標出兩個下拉選單各自的合法選項：

```ts
export const WARNING_SOUND_KEYS: SoundKey[] = ['chime', 'bell', 'gong']
export const FINAL_SOUND_KEYS: SoundKey[] = ['chime', 'bell', 'gong', 'polite', 'cheer', 'drumGong']
```

`SoundKey` type 與 `SOUND_LABELS` 維持不變——所有六種音效在 `useAudio` 中仍然可播，只是 UI 限制了哪裡可以選哪些。

**2. `src/components/WarningCard.vue`**

```ts
// before
const soundKeys = Object.keys(SOUND_LABELS) as SoundKey[]
// after
import { COLOR_LABELS, SOUND_LABELS, WARNING_SOUND_KEYS } from '../types'
const soundKeys = WARNING_SOUND_KEYS
```

**3. `src/components/SettingsPanel.vue`**

```ts
// before
const soundKeys = Object.keys(SOUND_LABELS) as SoundKey[]
// after
import { SOUND_LABELS, FINAL_SOUND_KEYS } from '../types'
const soundKeys = FINAL_SOUND_KEYS
```

雖然 `FINAL_SOUND_KEYS` 目前等同於 `Object.keys(SOUND_LABELS)`，但語意上更明確：未來若新增短音效，僅需加入 `WARNING_SOUND_KEYS` 與 `FINAL_SOUND_KEYS`，不會誤動結束音效清單。

### 邊界與 fallback

- **新增警告**：`addWarning()` 預設 `sound: 'gong'`，已落在合法集合內，不需要改。
- **URL 帶長音效到 warning**：parser 仍接受，UI 顯示下拉選單時，瀏覽器會自動把「不在 options 中的當前值」呈現為空白（或顯示在隱藏狀態）。使用者點下拉只看得到 chime/bell/gong，重新選一次就會覆寫掉非法值。這是「設錯讓他自己改」的最簡實作。

### 測試

不需要新增測試。現有 33 個測試保持不變：
- `useUrlSync.test.ts` 的 T3d / T4b 仍驗證 parser 接受長音效（這是規格的一部分：parser 寬鬆）
- UI 層的下拉選項清單沒有對應的單元測試（這層由視覺/手動驗證涵蓋）

驗證方式：手動開 dev server，確認警告里程碑下拉只有三個選項、結束音效下拉有六個選項。

## 影響範圍

- 修改檔案：`src/types.ts`、`src/components/WarningCard.vue`、`src/components/SettingsPanel.vue`
- 測試檔案：無
- 型別檢查：`pnpm build` 應通過
- 既有功能：無 regression（所有音效在 `useAudio` 仍可播放）
