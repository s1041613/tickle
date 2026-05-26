# Zoe 真機驗收 checklist（room-sync）

QA-4 自動化跑了 7/9，剩下 2 個只能在真機 / 真環境驗。
**目標：** 5 分鐘內跑完、回報 ✅ / ❌。

---

## 前置（一次性）

1. 確保你的 Mac 有起著 `pnpm party:dev` + `pnpm dev`（或部署到 staging 的話用 staging URL）
2. iPad 跟 Mac 在同一個 wifi
3. iPad Safari 開 dev URL；如果走 localhost，把 Mac IP 換進去（例：`http://192.168.x.x:5173/tickle/`）

---

## 場景 #5：iPad reconnect 接續

1. **Mac Chrome** 開新分頁 → URL 補上 `?room=XXXXXX&host=ht_...` → 把 host 那段拿掉、得 viewer URL
2. **iPad Safari** 貼 viewer URL → 應該看到「VIEWER · 唯讀」標籤
3. **Mac Chrome** 設 5 分鐘倒數、按開始 → iPad 應該也看到一樣的倒數
4. **iPad** 按 home 鍵切到別的 app（任何都行）→ 等 30 秒
5. **iPad** 切回 Safari
6. **預期**：
   - ✅ pass：iPad 上的秒數立刻同步到 Mac 當下的值（差 ≤ 1 秒）、繼續正常倒數
   - ❌ fail 模式：數字凍結在 30 秒前的舊值 / 跳成 0 / 變成 5:00 重置 / 顯示斷線
   - 若 fail：截圖回我（含 Mac + iPad 兩台螢幕）

## 場景 #6：Audio unlock + 警告音

1. **Mac Chrome** 設一個短倒數（例如 25 秒）、warning 設「20 秒響 chime」
2. **iPad Safari** 進 viewer 模式（同 #5 設定）
3. **iPad** 第一次進畫面會看到「點一下螢幕」橘色全螢幕 overlay → 點一下
4. **Mac** 按開始
5. **預期**：
   - ✅ pass：剩 20 秒時 iPad 也聽到 chime 聲（音量需打開）
   - ❌ fail 模式：iPad 完全沒聲音 / 聲音延遲 > 1 秒 / 只有 Mac 響
   - 若 fail：說明 iPad 系統音量 / 靜音鈕狀態（鈴聲鈕真的有時會擋）

---

## 回報格式

直接打給 lead 或我都行：

```
#5 iPad reconnect: ✅ / ❌
#6 Audio: ✅ / ❌
備註：（如有）
```

兩個都綠 = room-sync 整個 change 100% acceptance ready。
