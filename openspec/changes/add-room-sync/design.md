## Context

Tickle 既有架構是 6 個 composable 各管一件事的 Vue 3 SPA，狀態完全靠 URL params 跨裝置「分享」（其實只是「複製設定」）。沒有任何 server 端基礎建設、沒有跨 client 的訊息通道。這個 change 是 Tickle 第一次引入 realtime backend。

業界對「多裝置共享倒數」的標準做法（Stagetimer / 多人遊戲 / Google Meet 倒數）幾乎一致：**server 存「狀態變化」、client 用 NTP-style clock offset 校正、在本機 60fps 渲染**。不做 server 端高頻 tick——那是新手常踩的坑（流量爆炸 + 網路延遲反而讓畫面卡頓 + Cloudflare DO 費用飆高）。

研究結論（詳見 plan 檔案 `/Users/zoe/.claude/plans/task-parallel-pearl.md`）：
- 一般 NTP-synced 裝置之間時鐘偏差 < 100ms
- 計時器顯示到秒、肉眼可辨「不同步」的門檻約 250–500ms
- 採用 NTP-style 4-timestamp + 3 次中位數可達到 ±50ms 同步精度，遠優於肉眼門檻

## Goals / Non-Goals

**Goals:**
- Host 按下「開始」< 100ms 內自己畫面動、viewer 端 < 1 秒內同步看到對應變化
- 兩台 NTP-synced 裝置 並排顯示倒數，肉眼觀察數字翻動差 < 200ms
- 純前端「不打 server」的使用模式可以消失（接受這個 trade-off），但商業化前要能撐住數百個並發 room
- Host URL 外流時，原 host 立刻知道控制權被搶（kicked 流程）
- 既有 33 個單元測試全綠

**Non-Goals:**
- 雙向協作（任何人都可控）——主控模式刻意排除
- Host 移交 / 多 host 並存
- Presence（顯示「有 N 人在看」）
- 自訂 vanity room ID
- Room 30 天閒置過期（規模到再加）
- Playwright E2E（與 README 既有延後策略一致）
- 帳號登入 / 付費功能（商業化階段再做）

## Decisions

### 後端選型：PartyKit（Cloudflare Durable Objects 包裝）
- DO「一個 ID 對一個 instance」概念跟「一個 room ID 對一個 room state」完美契合
- WebSocket Hibernation API：room 沒人連時休眠不收錢、有人連秒復活
- 邊緣運算自動選最近機房、適合公開分享場景
- PartyKit 把 DO 的 boilerplate 壓到最低（一個 Server class、`onConnect` / `onMessage` 三件事）
- *Alternatives considered:* 自寫 Cloudflare Worker + DO（多 50 行 boilerplate）、Supabase Realtime（殺雞用牛刀，計時器不需要 Postgres）、Firebase RTDB（Google 鎖定深、未來搬家貴）、Ably / Pusher（免費額度小、貴）、Fly.io + Bun WebSocket（要自己處理 sticky session 跟跨 region 狀態同步）

### 同步模式：主控（host / viewer），不是雙向協作
- 對應 README 既有核心情境「電腦設定 → iPad 顯示」
- 完全消除「衝突」（只有一個寫入者）
- 未來商業化定價清晰：「演講者控制端 / 觀眾顯示端」可差異化
- *Alternative considered:* 雙向協作 + last-write-wins——使用情境不符、增加實作複雜度（防呆、merge）、被使用者直接否決

### 反應感：host 按下立刻動，不等 server round-trip
- 計時器 UX 核心是「按下立刻有反應」
- 配合 clock offset 校正，host 本機跑出來的 endAtMs 跟 server 一致
- *Alternative considered:* 等 server 算 endAtMs 再回——增加 ~200ms 延遲、肉眼可感

### 時鐘同步：NTP-style 4-timestamp（T1/T2/T3/T4）+ 3 次中位數
- 連線時量、`visibilitychange → visible` 跟 reconnect 時重量
- 不做週期性重新校正（業界共識：連線 + 可見性事件就夠）
- *Alternative considered:* Cristian 算法（單 round-trip）——少 1 個 timestamp，精度差一截

### URL 哲學翻轉：從「URL = 完整 state」到「URL = room 指針」
- 既有 DECISIONS.md 寫「整個設計是 URL 包含所有狀態」這條要被廢棄
- 進站若 URL 已有舊 params（`seconds`/`warn`/`repeat`/`final`），**一次性讀進來當新 room 的初始設定**，server 建好 room 後把這些 params 從 URL 拿掉、只留 `room`/`host`
- 換來：URL 變短（可口頭念出來）、單一真相來源（state 在 server）、未來付費功能不被「URL 必須能儲存所有設定」假設綁死
- 代價：純單機使用者也要連 server、離線分享 URL 失效
- 接受這代價的理由：Tickle 主要使用情境是公開展示計時器、需要 server-side state；離線分享不是核心需求

### Room ID 格式：6 位英數，31 字元集
- 字元集 `abcdefghjkmnpqrstuvwxyz23456789`（排除 `0/O/1/l/I/o`）≈ 887M 組合
- 可口頭傳遞（「room kay-seven-em」）、抄寫不易錯
- **碰撞防護由 client 端負責**：Client 抽 ID + 用 `?intent=create` 連 PartyKit；server 看 storage 是否已有 state，若有則回 `error: forbidden detail=room-already-exists` 並 close。Client 收到後重新抽 ID 重試，最多 5 次。
- *為什麼讓 client 抽：* PartyKit 是「一個 ID → 一個 Durable Object」，server 端只看得到「我這個 ID 的 storage 有沒有東西」，沒有跨 room 的全域 KV 查詢視角。讓 client 抽 + server 拒絕的「樂觀建立」模式比中心式 ID dispenser 簡單一個量級。
- *Alternatives considered:* UUID（URL 醜）、6 位數字 PIN（基數小、易猜）、字典單字組（可愛但長）

### Host token 格式：`ht_` 前綴 + 16 位英數
- 前綴讓肉眼可辨「這是 host token」、避免被當成普通字串貼錯地方
- 16 位英數 ≈ 36^16 = 8 × 10^24 種，不可能撞、不可能猜
- 由 server 在 room 建立瞬間產生、永久存在 DO storage、回傳給 client 一次後不再傳
- Client 把它存在 URL `?host=...`，每次 send patch 帶上

### 單一活躍 host 連線（最新者贏，「kicked」流程）
- 同個 host token 同時只能有一條活躍 WebSocket
- Server state 多一個欄位 `activeHostConnId: string | null`
- 新 host 連線進來時：server 先對舊 conn 送 `{type: 'kicked', reason: 'replaced'}`、close 舊 conn、設 `activeHostConnId = newConnId`
- 舊 tab 收到 `kicked` 後：UI 顯示「此分頁已被新分頁取代」、按鈕全 disable、降級為 viewer 行為（保留 WebSocket 但不再送 patch）
- Reload 路徑無痛：reload 時舊連線自然 close（瀏覽器 unload），新連線進來時 `activeHostConnId === null`、不會觸發 kick
- *Why:* 防止 host URL（含 token）外流到 Slack / 螢幕分享被截圖時，控制權被悄悄共用、原 host 不知情。最新者贏可立刻通知原 host「有人接手」
- *Alternatives considered:* 多 tab 都接受（不安全）、UI 顯示多 host 警告（reload 也會誤觸）

### Server authoritative，但不做高頻 tick
- Server 只在「狀態變化」時 broadcast（start / pause / reset / setting change）
- 持續 tick 在 client 端用 `Date.now() + clockOffset` 算 `remaining = endAtMs - serverNow`
- *Why:* Cloudflare DO duration billing + outgoing message：每 100ms 推一次的方案會炸成本、且網路延遲讓畫面卡頓
- *Concrete numbers:* 一個 room 10 個 viewer，event-based ~10 條訊息/操作；server-tick 每秒 100 條，1000 倍差距

### Last-write-wins 衝突處理（雖然主控模式沒衝突）
- Server 收到 patch 的順序就是 truth
- 不做樂觀更新後的 rollback（主控模式下 host 是唯一寫入者，自己跟自己不會衝突；kicked 流程處理「兩個 tab 都拿 token」的邊界）

### 重連狀態：完全接續
- iPad viewer 切背景 5 分鐘、切回 → 自動重連、跟 server 拿最新 state hydrate、繼續倒數
- 不重置成 idle（會破壞「分享前約好等等用這個 room」的情境）
- 用 `partysocket` client library 內建的 exponential backoff reconnect + message queue

### Room 生命週期：永不主動清理（MVP）
- 規模到（同時 > 10 萬活躍 room）再加 30 天閒置過期
- 每個 room ~1KB，Cloudflare KV 免費 5GB，能撐很久

## Risks / Trade-offs

- **[Risk]** iPad Safari WebSocket 在背景被殺：可能在切到背景 30s 後 server 端看到 disconnect。`partysocket` reconnect 邏輯會處理，但要實機驗證。**Mitigation:** 手動驗收清單第 5 項
- **[Risk]** 兩端時鐘差 > 2 秒（NTP 異常）會讓計時明顯不同步：clock offset 校正會把這個差吃掉，但若 sample 之間方差過大、median 也不可靠。**Mitigation:** 連線時若 3 次 sample 的標準差 > 500ms，UI 跳警告「時鐘偏差過大，倒數顯示可能不準」
- **[Trade-off]** 進站就連 server = 沒有「純前端零成本」模式。所有人都打 server、付 DO duration / request 費用。**Mitigation:** PartyKit 免費額度寬鬆，hobby / 早期商業化規模幾乎免費；中長期可加「不分享就不連」的 lazy create
- **[Trade-off]** Host URL 弄丟 = 永遠失去控制：MVP 不做 localStorage 備援 / 帳號綁定。重建 room 即可
- **[Risk]** 既有 `useUrlSync` 大幅縮減，破壞「URL 完整 backup」舊行為。**Mitigation:** 保留一次性 import 路徑、舊 URL 還能進來；docs/DECISIONS.md 更新並標註廢棄條目
- **[Risk]** PartyKit 計費規則 / 免費額度跟研究時不一樣：依賴 Cloudflare 上游決策。**Mitigation:** server code 寫成可移植形狀（純 WebSocket message handler，~30 行核心邏輯），未來搬家成本低
- **[Risk]** WebSocket reconnect 邏輯複雜度爆炸：若超過 100 行代表選錯抽象。**Mitigation:** 強制使用 `partysocket` 內建 backoff，不自己寫
