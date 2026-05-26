## ADDED Requirements

### Requirement: First-time visit auto-creates a room

第一次打開 `https://tickle.app/`（網址無 `room` param）時，client SHALL 自動連 PartyKit server 建立一個新 room、取得 host token、並把 URL 補成 `?room=<id>&host=<token>`。

#### Scenario: 乾淨網址進站
- **WHEN** 使用者打開 `https://tickle.app/`（URL 完全沒有 query string）
- **THEN** client 抽 6 位英數 room ID（31 字元集，排除 `0/O/1/l/I/o`）並用 `?intent=create` query 連 PartyKit server
- **AND** server 查 Durable Object storage、判斷該 room ID 是否已存在
- **AND** 若不存在，server 產生 `ht_` 前綴 + 16 位英數 host token、寫入 DO storage、回 `{ type: 'hydrate', state, serverNow }`
- **AND** client 用 `history.replaceState` 把 URL 改成 `?room=<id>&host=<token>`

#### Scenario: Room ID 碰撞重試（client 端負責）
- **WHEN** Client 抽到的 room ID 已存在 storage
- **THEN** Server 回 `{ type: 'error', code: 'forbidden', detail: 'room-already-exists' }` 並 close 該連線
- **AND** Client 重新抽 ID、重新連，最多 5 次
- **AND** 5 次都撞 → Client status 進入 `forbidden` 狀態（極端罕見：6 位 31 字元集 ≈ 887M 空間）

#### Scenario: 進站時 URL 已有舊版 params
- **WHEN** 使用者打開 `?seconds=300&warn=60:yellow:chime&repeat=true`（舊版可分享 URL）
- **THEN** client 在建 room 前先 parse 這些 params
- **AND** 把 parse 出來的值當成新 room 的初始 `duration` / `warnings` / `repeat`
- **AND** server 建好 room 後、client 用 `history.replaceState` 把舊 params 從 URL 拿掉，只留 `?room=<id>&host=<token>`

### Requirement: Host can write, viewer is read-only

URL 含 `host` token 的 client SHALL 取得 host 角色、可送 patch 改 room state；URL 只有 `room` 沒 `host` 的 client SHALL 進入 viewer 模式、UI 不能觸發任何 state 變更。

#### Scenario: Host 開始倒數
- **WHEN** Host client 按主按鈕「開始」
- **THEN** Host client 自己畫面立即進入 running 狀態（不等 server）
- **AND** Host client 算出 `endAtMs = (Date.now() + clockOffset) + duration * 1000` 並送 `{ type: 'patch', hostToken, changes: { status: 'running', endAtMs } }`
- **AND** Server 驗證 `hostToken === room.hostToken` 通過、更新 room state、broadcast `{ type: 'update', state, serverNow }` 給所有連線
- **AND** Viewer client 收到 update 後 0.5 秒內畫面也進入 running、開始倒數

#### Scenario: Viewer 試圖按主按鈕
- **WHEN** Viewer client（URL 沒 `host` token）試圖點主按鈕、設定面板輸入框、或重設按鈕
- **THEN** UI 元素全部 disabled 或 `pointer-events: none`
- **AND** 沒有 patch 訊息送到 server

#### Scenario: 偽造的 patch 訊息
- **WHEN** 任何 client 送 `{ type: 'patch', hostToken: 'wrong', ... }`
- **THEN** Server 拒絕、不更新 state、不 broadcast
- **AND** Server 回 `{ type: 'error', code: 'forbidden' }` 給該 client

#### Scenario: Stale host conn 試圖送 patch（kicked 後尚未處理完）
- **GIVEN** Host tab A 已被 Tab B 取代（activeHostConnId === connB）
- **WHEN** Tab A 在收到 `kicked` 之後、close 完成之前還送 `{ type: 'patch', hostToken, ... }`（token 仍然正確、只是 conn 不是 active）
- **THEN** Server 拒絕、不更新 state、不 broadcast
- **AND** Server 回 `{ type: 'error', code: 'forbidden', detail: 'not-active-host' }` 給 Tab A
- *理由*：token 正確不代表 conn 還是 active；雙重檢查（token 對 + conn id === activeHostConnId）才能真正禁止 stale tab 寫入

### Requirement: Server is authoritative for state, client renders locally

Server SHALL 持有 room state 的唯一真相；client SHALL 不做 server-side tick，而是用 clock offset 校正後的本機時鐘在每個 animation frame 計算 `remaining = endAtMs - (Date.now() + clockOffset)`。

#### Scenario: Client 連線時做 clock offset 校正
- **WHEN** client 第一次 WebSocket 連上 server
- **THEN** client 連續送 3 次 `{ type: 'ping', t1: Date.now() }`
- **AND** server 對每個 ping 回 `{ type: 'pong', t1, t2, t3 }`，其中 t2 是 server 收到時的時間、t3 是 server 送 pong 時的時間
- **AND** client 收到每個 pong 時記錄 t4，算 `offset = ((t2 - t1) + (t3 - t4)) / 2`
- **AND** client 取 3 個 offset 的中位數當 `clockOffset`

#### Scenario: Visibility 重新校正
- **WHEN** `document.visibilityState` 從 `hidden` 變回 `visible`
- **THEN** client 重新跑 clock offset 校正流程
- **AND** 重新對 server 拿一次最新 state hydrate

#### Scenario: Hydrate on connect
- **WHEN** Viewer client 第一次連到一個 running 中的 room
- **THEN** Server 立即送 `{ type: 'hydrate', state, serverNow }`
- **AND** Viewer client 用收到的 `endAtMs` + 自己算好的 `clockOffset` 算當前 remaining、進入 running 狀態並開始 rAF 渲染

### Requirement: Only one active host connection per room

同一個 host token 同時 SHALL 只能有一條活躍的 host WebSocket。新 host 連線進來時，server SHALL 主動踢掉舊連線（kicked 流程）。

#### Scenario: 複製 tab 觸發 kicked
- **GIVEN** Host tab A 已連上 room、`activeHostConnId === connA`
- **WHEN** 使用者複製分頁產生 Tab B（URL 完全一樣含 host token）
- **AND** Tab B 連上 server
- **THEN** Server 驗證 hostToken 對、但發現 `activeHostConnId !== null`
- **AND** Server 對 connA 送 `{ type: 'kicked', reason: 'replaced' }` 然後 close connA
- **AND** Server 設 `activeHostConnId = connB`、Tab B 正常運作
- **AND** Tab A UI 顯示「此分頁已被新分頁取代」、按鈕全 disable、不再送 patch

#### Scenario: Reload host 不會誤觸 kick
- **GIVEN** Host tab A 連上 room
- **WHEN** 使用者按 reload
- **THEN** 瀏覽器 unload 時 WebSocket 自然 close
- **AND** Server 端 `onClose` 把 `activeHostConnId` 設回 null
- **AND** 重新載入的 client 連上時 server 看到 `activeHostConnId === null`、不送 kicked、正常成為新 active host

#### Scenario: Viewer 連線不受 activeHostConnId 影響
- **GIVEN** Host tab A 已連
- **WHEN** Viewer client 連上同 room
- **THEN** Server 不檢查 host token（viewer 沒帶）、不影響 `activeHostConnId`
- **AND** Viewer 正常進入 read-only 模式

### Requirement: Sharing UI generates viewer URL

Host UI SHALL 提供「複製連結」按鈕，按下後產生不含 host token 的 viewer URL 並複製到剪貼簿（或顯示 dialog 讓使用者複製）。

#### Scenario: 點複製連結
- **WHEN** Host 點右上角「複製連結」按鈕
- **THEN** 跳出 dialog 顯示 viewer URL（從 host 當前 URL 移除 `host` param 而得）
- **AND** dialog 有複製按鈕，按下會把 viewer URL 寫入 clipboard
- **AND** 取得的 viewer URL 只含 `?room=<id>`，不含 `host=...`

### Requirement: Nonexistent room shows guidance and rebuilds

Viewer client 連到不存在的 room ID 時，UI SHALL 顯示「Room 不存在、重新建立中」訊息、自動清掉 URL params、reload 進入新 room。

#### Scenario: 貼到失效 room ID
- **WHEN** Viewer client 連線時送 room ID `zzzzz`
- **AND** Server 找不到該 room
- **THEN** Server 回 `{ type: 'error', code: 'room-not-found' }`
- **AND** Viewer client 顯示「Room 不存在或已過期、正在建立新的 room」全螢幕引導畫面
- **AND** Client 用 `history.replaceState` 清掉 URL params、`location.reload()` 進入首次進站流程

### Requirement: All settings sync within the room

Room state SHALL 包含全部「可調設定」：`duration`、`repeat`、`warnings`、`finalSound`。Host 改任一設定 SHALL broadcast 給所有 viewer，viewer 端 UI 對應更新。

#### Scenario: Host 改 duration
- **WHEN** Host 在 idle 狀態把 duration 從 300 改成 600
- **THEN** Host client 送 `{ type: 'patch', hostToken, changes: { duration: 600 } }`
- **AND** Server broadcast update、所有 viewer 看到 timer display 從 5:00 變 10:00

#### Scenario: Host 計時中改 duration
- **WHEN** Host 在 running 狀態改 duration
- **THEN** 當前倒數**不**受影響（既有單機行為一致）
- **AND** 設定面板的 duration 值同步更新到 viewer 端、下次 start 才套用

#### Scenario: Host 改 warnings
- **WHEN** Host 在 SettingsPanel 新增 / 刪除 / 修改 warning
- **THEN** server broadcast 新 warnings 陣列
- **AND** Viewer 端 useMilestones 用新 warnings 重新計算 visualState
- **AND** Viewer 設定面板（即使 disabled）顯示同樣的 warning 清單

### Requirement: Reconnect preserves running state

WebSocket 斷線（網路斷、tab 切背景被瀏覽器殺連線）後重連，client SHALL 自動向 server 拿最新 state hydrate、繼續顯示正確的 remaining。

#### Scenario: Viewer iPad 背景 5 分鐘
- **GIVEN** Viewer 在 iPad Safari 看 running 中的計時器
- **WHEN** 使用者切到別的 app 5 分鐘、再切回 Tickle
- **THEN** `partysocket` 自動觸發 reconnect
- **AND** Server 推 `{ type: 'hydrate', state, serverNow }`
- **AND** Client 重新算 clock offset、用 server 的 `endAtMs` 算當前 remaining、繼續 rAF 渲染
- **AND** 數字顯示跟 host 同步、誤差 < 200ms

#### Scenario: Host reload 接續
- **GIVEN** Host 計時器在 running 中（剩 3:00）
- **WHEN** Host 按 reload
- **THEN** 新載入的 host client 從 URL 拿到 `host` token、連 server
- **AND** Server 送 hydrate，client 顯示「剩 3:00」並繼續倒數
- **AND** 不重置成 idle

### Requirement: Clock sync accuracy is observable

兩台 NTP-synced 裝置並排顯示同一 room 倒數，數字翻動時機差 SHALL < 200ms（一個 frame 內，肉眼不可辨）。

#### Scenario: Mac + iPad 並排觀察
- **GIVEN** Mac Chrome 是 host、iPad Safari 是 viewer、同一 room
- **WHEN** Host 按開始 5 分鐘倒數、靜置 5 分鐘
- **THEN** 兩台螢幕的秒數翻動時機差 < 200ms
- **AND** 倒數到 0 的時刻兩台同時觸發 final sound 與 done 畫面

### Requirement: Server rejects malformed messages

Server SHALL 防禦性處理任何來自 client 的格式錯誤訊息，回 `error: bad-message` 而不是 throw / silently ignore。

#### Scenario: 非 JSON 文字
- **WHEN** Client 送 `'this is not json'`（純字串、非合法 JSON）
- **THEN** Server `JSON.parse` 失敗、回 `{ type: 'error', code: 'bad-message' }`
- **AND** Server 不更新任何 state、不 broadcast

#### Scenario: 未知 message type
- **WHEN** Client 送 `{ type: 'mystery', payload: 'whatever' }`
- **THEN** Server 不認得 type、回 `{ type: 'error', code: 'bad-message' }`

#### Scenario: Patch payload 結構錯誤
- **WHEN** Host 送 `{ type: 'patch', hostToken, changes: { status: 'banana' } }`（`status` 不在 allowed enum）
- **THEN** Server 的 `sanitizePatch` 回 null、不更新 state、回 `{ type: 'error', code: 'bad-message' }`
- *理由*：trust-but-verify。host 已經因為 URL access 被信任，但 wire 上仍可能有 client bug；做 structural sanity 不是 security boundary 而是 robustness

## MODIFIED Requirements

### Requirement: URL acts as room pointer, not state container

原本 `useUrlSync` 把 4 個設定 ref（`duration`/`repeat`/`warnings`/`finalSound`）雙向同步進 URL params 的行為 SHALL 被廢棄。URL SHALL 只保留 `room` 與 `host` 兩個 param 作為 room 指針。

舊版 URL params (`seconds`/`warn`/`repeat`/`final`) 進站時仍可被讀取一次當作新 room 的初始設定，但 server 建好 room 後 SHALL 從 URL 移除。

#### Scenario: 設定變動不再寫 URL
- **WHEN** Host 改 duration / warnings / finalSound / repeat
- **THEN** URL 上的 query params 不變（仍只有 `room` 與 `host`）
- **AND** 變動透過 WebSocket patch 推到 server、server broadcast 給 viewer

#### Scenario: 舊 URL 進站相容
- **WHEN** 使用者貼一個帶舊 params 的 URL（例：`?seconds=300&warn=60:yellow:chime&final=gong`）
- **THEN** Client 進站時 parse 這些 params 當新 room 的初始設定
- **AND** Server 建好 room 後 client 用 `history.replaceState` 把舊 params 清掉、只留 `?room=<id>&host=<token>`
- **AND** 之後 URL 不再變動
