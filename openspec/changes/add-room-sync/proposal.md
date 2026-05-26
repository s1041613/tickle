## Why

Tickle 目前是純前端 SPA，所有狀態（含設定）寫進 URL 即可在另一台裝置「打開同樣的計時器」。但這只能分享**設定**——A 開始倒數後，B 開啟 URL 仍要自己按開始才會跑，兩台計時器各自為政、時鐘不同步。

Notion Tracker 上的 High 優先 feature request「即時狀態的計時器」明確要求：「在 A 裝置開始倒數，把網址分享出去在 B 裝置上看，也要是同樣的倒數計時狀態」。這正好契合 README 既有的核心使用情境——「電腦端設定好 URL 後丟到 iPad Safari 顯示」，目前那個流程只能設定一次、無法在過程中即時調控。

引入 realtime sync 是這個 app 從「URL 可分享的離線計時器」進化成「公開展示工具」必經的一步，也為未來商業化（付費鎖定主控權、room 持久化、品牌客製）鋪路。

## What Changes

- **引入 PartyKit（Cloudflare Durable Objects 包裝）作為 realtime server**，新增 `party/` sub-project 與部署設定
- **採用 host / viewer 主控模式**：建 room 的 client 是 host、寫權限受 `hostToken` 保護；分享 URL 拿掉 host token 後給別人即為 viewer，畫面唯讀、即時跟隨 host 狀態
- **URL 哲學翻轉**：從「URL 包含所有狀態」改為「URL 只是 room 指針，狀態存 server」。第一次進站自動建 room、URL 補成 `?room=k7m2x9&host=ht_abc`；不再寫 `seconds/warn/repeat/final` 進 URL（保留一次性讀取舊 URL 當新 room 初始設定的相容路徑）
- **Server authoritative + client-side clock offset 校正**：server 是狀態真相，但不做高頻 tick；client 連線時用 NTP-style 4-timestamp（3 次中位數）取 clock offset，之後本機 60fps 渲染。業界主流 Stagetimer 同方法
- **單一活躍 host 連線（最新者贏）**：同個 host token 只能有一條活躍 WebSocket。新 host 連線進來時 server 主動 kick 舊連線，防止 host URL 外流時控制權被悄悄共用
- **新增 share UI**：右上角「複製連結」按鈕，跳 dialog 顯示 viewer URL（自動去掉 `&host=`）
- **新增「Room 不存在」引導畫面**：viewer 貼到失效 room ID 時，顯示「Room 不存在、重新建立中」並自動 reload 進入新 room

## Capabilities

### New Capabilities
- `room-sync`：跨裝置即時狀態同步基礎建設——PartyKit server、host/viewer 角色模型、host token 認證、clock offset 校正、kicked 流程、room 不存在處理

### Modified Capabilities
- `url-sync` 範圍縮減：從「設定的權威來源」降級為「room 指針 + 舊 URL 一次性 import」。原本對 `seconds/warn/repeat/final` 的 watch-write 全部移除

## Impact

- **新 sub-project**：`party/server.ts`、`party/types.ts`、`party/idGen.ts`、`partykit.json`、`party/tests/`
- **新 dev / runtime deps**：`partykit`、`partysocket`、`partykit/server`（dev）；`partysocket`（runtime client）
- **修改檔案**：`src/App.vue`、`src/composables/useUrlSync.ts`、`src/composables/useTimer.ts`、`src/components/SettingsPanel.vue`、`src/components/AudioUnlockOverlay.vue`、`vite.config.ts`、`docs/DECISIONS.md`、`docs/STATUS.md`、`README.md`
- **新檔案**：`src/composables/useRoomSync.ts`、`src/composables/useShareLink.ts`、`src/components/ShareButton.vue`、`src/components/ShareDialog.vue`、`src/components/RoomNotFoundScreen.vue`、`tests/composables/useRoomSync.test.ts`
- **行為變更**：純前端「打開就能用、零 server 依賴」消失——進站即連 server 建 room。離線使用不再支援
- **URL 變短**：viewer URL 從 `?seconds=300&warn=...&final=gong` 變成 `?room=k7m2x9`
- **`docs/DECISIONS.md` 既有條目「URL 包含所有狀態」需要被廢棄並加新條目「Room-based mode」**
- **既有 33 個單元測試保持綠**，新增測試覆蓋 `useRoomSync` 與 PartyKit server
