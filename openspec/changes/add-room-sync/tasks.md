## 1. Tooling & 部署設定

- [x] 1.1 安裝 dev / runtime deps：`pnpm add -D partykit` + `pnpm add partysocket`
- [x] 1.2 建 `partykit.json`：設 server entry `party/server.ts`、name `tickle-sync`
- [x] 1.3 `package.json` 加 scripts：`party:dev`（npx partykit dev）、`party:deploy`（npx partykit deploy）
- [x] 1.4 `vite.config.ts` 加 PartyKit dev proxy：把 `/parties/*` 轉到 `localhost:1999`
- [x] 1.5 `tsconfig.json` 把 `party/**/*.ts` 也納入型別檢查範圍（用 separate tsconfig.party.json 也可）
- [x] 1.6 跑 `pnpm party:dev` + `pnpm dev` 確認 hello-world 串通

## 2. Server 端基礎建設

- [x] 2.1 寫 `party/types.ts`：`RoomState` / `ClientMessage` / `ServerMessage` / `Warning` 等共用型別
- [x] 2.2 寫 `party/idGen.ts`：`generateRoomId()`（6 位英數、31 字元集）+ `generateHostToken()`（`ht_` + 16 位英數）
- [x] 2.3 寫 `party/server.ts` 骨架：PartyKit `Server` class、`onConnect` / `onMessage` / `onClose` 接通
- [x] 2.4 實作 room 建立流程：第一次連線時若 storage 沒 room state、生 ID + token、初始化預設 state
- [x] 2.5 實作 room ID 防撞：建 room 前查 storage、撞了重試最多 5 次（server 端回 `room-already-exists`；client 端負責重試）
- [x] 2.6 實作 host token 驗證：`onMessage` 收到 patch 時比對 `hostToken`、不對回 `error: forbidden`
- [x] 2.7 實作 broadcast：state 變動後送 `{ type: 'update', state, serverNow }` 給所有連線
- [x] 2.8 實作 hydrate：新 client 連上時主動送 `{ type: 'hydrate', state, serverNow }`
- [x] 2.9 實作 ping/pong：收到 `{ type: 'ping', t1 }` 回 `{ type: 'pong', t1, t2, t3 }`
- [x] 2.10 實作 kicked 流程：新 host 連線時送 `kicked` 給舊 conn、close 舊 conn、更新 `activeHostConnId`
- [x] 2.11 實作 room-not-found：viewer 連到不存在 room 時回 `error: room-not-found`

## 3. Server 端測試（QA-1 / Task #4 已完成）

- [x] 3.1 設定 PartyKit test helper（in-memory `FakeRoom` / `FakeStorage` / `FakeConnection` in `tests/server/fakeRoom.ts`）+ vitest 整合（既有 `tests/**/*.test.ts` glob 已涵蓋，無需改 vitest.config）
- [x] 3.2 寫 `tests/server/server.test.ts`：room 建立 happy path（S1 / S1b seed / S1c malformed seed）
- [x] 3.3 寫測試：room ID 防撞（S2'：用 `storage.seed` 模擬已存在 → 回 forbidden detail=room-already-exists、storage 不被覆寫）
- [x] 3.4 寫測試：host token 驗證通過 / 失敗（S4-pre / S5）
- [x] 3.5 寫測試：patch 觸發 broadcast、所有 conn 收到（S4）
- [x] 3.6 寫測試：hydrate on new connection（S7 viewer / S4-pre host reconnect）
- [x] 3.7 寫測試：ping/pong 回應正確（S8）
- [x] 3.8 寫測試：kicked 流程（S9：兩條 host conn 同 token、舊的收到 kicked、新的成為 active）
- [x] 3.9 寫測試：room-not-found 回 error（S10）
- [x] 3.10 寫測試：`onClose` 把 `activeHostConnId` 設回 null（S11 / S11b reload 不誤觸 kick / S11c viewer close 不影響 active host）
- 加 bonus：S5b stale-host 拒絕 not-active-host、S4b bad patch payload、S12a non-JSON / S12b unknown type / S12c patch on empty storage

備註：實際路徑是 `tests/server/` 不是 `party/tests/`（QA 選的，更貼齊既有測試結構、不需動 vitest config）

## 4. Client composable: useRoomSync

- [x] 4.1 寫 `src/composables/useRoomSync.ts` 骨架：建 `partysocket` 連線、暴露 `isHost` / `isConnected` / `roomState` refs
- [x] 4.2 實作 clock offset 校正：連線時送 3 次 ping、收 pong、算 offset、取中位數
- [x] 4.3 實作 hydrate：收到 server 推來的 state 後更新 local refs（用 shallowRef 整批 swap）
- [x] 4.4 實作 patch helper：host 端 send `{ type: 'patch', hostToken, changes }`
- [x] 4.5 實作 `visibilitychange` listener：visible 時重做 clock offset + 重請 hydrate
- [x] 4.6 實作 kicked handler：收到 `kicked` 時設 `isHost = false`、status='kicked'（UI toast 在 App.vue 處理）
- [x] 4.7 實作 room-not-found handler：呼叫 `onRoomNotFound` callback（URL 清除 + reload 由 App.vue / useUrlSync 處理）
- [x] 4.8 整合 `partysocket` reconnect：onClose 不主動斷、讓 lib 自動重連

## 5. Client composable 測試（QA-2 / Task #6 已完成）

- [x] 5.1 寫 `tests/composables/useRoomSync.test.ts`、mock WebSocket
- [x] 5.2 測試：connect → hydrate → refs 更新（C1 / C5）
- [x] 5.3 測試：clock offset 校正中位數計算（C2）
- [x] 5.4 測試：host send patch、訊息格式對（C3 / C4）
- [x] 5.5 測試：收到 update broadcast、refs 更新（C5）
- [x] 5.6 測試：收到 kicked、`isHost` 變 false（C6）
- [x] 5.7 測試：收到 room-not-found、觸發 reload callback（C7）
- [x] 5.8 測試：visibilitychange→visible 觸發重做 sync（C8）

## 6. URL 處理重構

- [x] 6.1 大幅縮減 `src/composables/useUrlSync.ts`：移除設定 ref watch-write 邏輯（保留 deprecated shim `useUrlSync(refs)` 讓 App.vue 暫時還能 compile，Task #10 拆掉）
- [x] 6.2 新增 `loadFromLegacyUrl(search?)`：parse `seconds`/`warn`/`repeat`/`final`，回 `LegacyUrlValues`（只含有的欄位）
- [x] 6.3 新增 `readRoomParam()` / `readHostParam()` / `writeRoomAndHost(roomId, hostToken|null)`
- [x] 6.4 新增 `clearLegacyUrlParams()`：清舊 params 留 room/host，沒 room 不亂改
- [x] 6.5 既有 `parseWarnings` / `serializeWarnings` 保留為 export
- 加 bonus：`hasLegacyUrlParams(search?)` helper（cheap 檢查、App.vue 可拿來決定要不要進 seed 流程）

## 7. App.vue 整合

- [x] 7.1 引入 `useRoomSync`，hydrate 後把 server state 映射到既有 4 個設定 ref（含 `applyingFromServer` echo-suppression guard）
- [x] 7.2 改 timer 行為：viewer 模式不呼叫 `timer.start()`，改成從 server 推來的 `endAtMs` 用 `timer.startWithEndAt(endAtMs - clockOffset)` 啟動
- [x] 7.3 watch 4 個設定 ref + timer.status 變化：host 模式下變動時送 patch
- [x] 7.4 主按鈕 / 重設按鈕：viewer / kicked 模式 disabled + opacity 0.45 + saturate 0.4
- [x] 7.5 RoomNotFound placeholder：roomNotFound 時遮罩顯示 + 3s 自動 reload（FE-7 換成正式 RoomNotFoundScreen）
- 加 bonus：useUrlSync deprecated shim 已拆除，App.vue 直接用具名 helper

## 8. useTimer 擴充

- [x] 8.1 新增 `startWithEndAt(endAtMs: number)` 入口：不重置 `totalSec`、直接用外部 endAt 啟動
- [x] 8.2 確保既有 `start()` 行為不變（既有 33 個既有測試全綠；加上 QA 新寫的 server / useRoomSync / startWithEndAt 三套共計 171 個全綠）
- [x] 8.3 補單測：`startWithEndAt` 從給定 endAt 倒數（QA-3 / Task #9 完成）

## 9. UI 元件

- [x] 9.1 寫 `src/components/ShareButton.vue`：**左下** `bottom-7 left-7`、host 模式才渲染（v-if）、ghost pill 44px、state-done 反白
- [x] 9.2 寫 `src/components/ShareDialog.vue`：center modal teleported to body、backdrop blur(2px)、pop-in 動畫、URL input click-to-select、copy CTA 變綠 1.5s 動畫、QR placeholder、ESC/backdrop 關閉
- [x] 9.3 寫 `src/components/RoomNotFoundScreen.vue`：米白底全螢幕、140×140 disc + orange spinner ring 1.4s、3s 倒數 + 自動 reload、手動 fallback、role="alert"、響應式 110px on phones
- [x] 9.4 改 `src/components/SettingsPanel.vue`：加 `readOnly` prop → CSS `.is-readonly` namespace 灰所有 input/select/button + 「+ 新增警告」`v-if="!readOnly"` 完全不渲染 + 頂部 viewer hint banner
- [x] 9.5 確認 `AudioUnlockOverlay.vue`：viewer 也會看到（既有 `v-if="!unlocked"` 已涵蓋，無需改）
- 加 bonus：`KickedRibbon.vue`（拆獨立元件）+ `ViewerBadge.vue`（拆獨立元件）+ `TimerDisplay` 加 `subtitle` prop（viewer 顯示「由 host 控制中」）

## 10. composable: useShareLink

- [x] 10.1 寫 `src/composables/useShareLink.ts`：暴露 `viewerUrl` ref + `copyState` 4-state machine + `copyToClipboard()` + `refresh()` + 純函式 `stripHostParam(fullUrl)`；含 navigator.clipboard 主路徑 + legacy textarea fallback；popstate listener；可選 `copiedResetMs`
- [x] 10.2 整合到 ShareDialog：App.vue 用 `share.viewerUrl.value` + `share.copyToClipboard()` 取代手 roll 的 minimal logic；`shareCopied` 改 computed 從 copyState 推；onCreated 後呼叫 `share.refresh()`

## 11. 文件更新

- [x] 11.1 `docs/DECISIONS.md` 廢棄「URL 包含所有狀態」條目（標 [DEPRECATED 2026-05-25]）+ 加新條目「Room-based mode：URL = room 指針、不是 state 容器」（含翻案理由 / Legacy URL 相容 / Room ID client retry / Host token / 單一活躍 host conn / Stale conn 防護 / 主控不雙向 / event-based no tick / 永不主動清理）；同步修「localStorage 偏好記憶」「給新 Claude 建議」章節
- [x] 11.2 `docs/STATUS.md` 完整改寫：日期 5/15→5/25、一句話總結（feat/room-sync 進度）、整體進度表（含 add-room-sync 12 個 sub-task 明細）、最近完成（按 6 大組）、技術債 7 項（room-sync 相關 4 項）、下一步路線（FE-10 → QA-4 → QA-5 → merge）、開工檢查清單（含 pnpm party:dev）
- [x] 11.3 `README.md` URL params 章節改寫：room / host 兩個 param 表、Legacy URL 相容遷移、Host vs Viewer 行為對比表；特色清單加跨裝置即時 sync；技術棧加 PartyKit + partysocket；composable 切分表加 useRoomSync / useShareLink；專案結構加 `party/` + `mockups/` + 新 components + 新 tests 子目錄；測試章節 33→171；OpenSpec 章節加 add-room-sync
- [x] 11.4 `README.md` 新增「PartyKit Backend」章節：本機開發（pnpm party:dev + vite proxy）、party/ 結構、部署（pnpm party:deploy + token）、Room 生命週期 & 計費（hibernate / 永不主動清理 / event-based 1000x 差距）
- 加 bonus：spec.md 修 ID 防撞語意 + 加 S5b not-active-host + S12 bad-message 三個 Scenario；design.md 同步 ID 防撞 client retry 寫法

## 12. 手動驗收

- [ ] 12.1 基本場景：Mac Chrome 開 `tickle.app/` → 自動建 room → URL 補上 `?room=...&host=...` → 設定 5 分鐘 → 按開始 → iPad Safari 開 viewer URL → 看到同樣倒數
- [ ] 12.2 Host 操作同步：host 暫停 → viewer 0.5 秒內看到暫停；host 改 duration → viewer 設定面板對應變化；host 重設 → viewer 也重設
- [ ] 12.3 Viewer 唯讀：viewer 端按主按鈕沒反應；viewer 端設定面板 disabled
- [ ] 12.4 Reload 接續：host 在 running 中 reload → 倒數接續、不重置
- [ ] 12.5 Reconnect：iPad viewer 切到背景 5 分鐘、切回前景 → 自動重連 + 顯示正確當前剩餘秒數
- [ ] 12.6 Audio unlock：viewer 第一次點擊解鎖 → 警告觸發音效有聲
- [ ] 12.7 不存在 room：手動貼 `?room=zzzzz` → 看到「Room 不存在、重新建立中」→ 自動 reload + 新 room
- [ ] 12.8 Clock 精度：Mac + iPad 兩台秒數翻動時機差 < 200ms
- [ ] 12.9 複製 tab / host token 外流：在 host tab 按右鍵複製分頁 → 新 tab 變成 active host、舊 tab 跳「此分頁已被新分頁取代」訊息且按鈕全 disable

## 13. CI / 部署

- [x] 13.1 GitHub Actions 加 `pnpm party:deploy` 步驟：`.github/workflows/deploy.yml` 在 `pnpm test` 後、`pnpm build` 前插入；用 `PARTYKIT_TOKEN: ${{ secrets.PARTYKIT_TOKEN }}` env；workflow 頭加註解列出 zoe 要設的 secret
- [x] 13.2 Production PartyKit URL 注入：`useRoomSync.buildSocketOptions` 加 `import.meta.env.VITE_PARTYKIT_HOST` 解析（優先序：options.host > env > window.location.host）；workflow `env:` block 設 `VITE_PARTYKIT_HOST: tickle-sync.s1041613.partykit.dev`；README PartyKit Backend 章節加「首次部署」設定步驟 + host 解析順序說明；驗證 `VITE_PARTYKIT_HOST=... pnpm build` 後 bundle 確實 hardcode 該字串
- [ ] 13.3 推到 feat/room-sync branch、開 PR、確認 Actions 全綠 — **lead 負責**，FE 已備好 config 不 commit

## 14. Validation

- [ ] 14.1 跑 `pnpm test` — 既有 33 + 新增測試全綠
- [ ] 14.2 跑 `pnpm build` — vue-tsc + Vite production build 通過
- [ ] 14.3 跑 `openspec validate add-room-sync` — change 格式正確
- [ ] 14.4 手動驗收清單 12.1–12.9 全綠後才能 merge
