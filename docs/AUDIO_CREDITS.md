# Audio Credits

tickle 內建的音效來源紀錄。`gong` / `bell` / `chime` 為 Web Audio 合成(無外部素材),`drumGong` 使用 freesound.org CC0 預錄樣本。

## drumGong

音效 `drumGong`(UI 顯示「🥁 drumGong」)由兩個 freesound.org 上的 **CC0 (public domain)** 錄音樣本疊播而成,在 `src/composables/useAudio.ts` 的 `playDrumGong()` 內以 A2 配方混音(D 提供攻擊 + C 提供共鳴長尾)。

| 檔案 | freesound ID | 作者 | 授權 | 用途 |
|------|--------------|------|------|------|
| `public/audio/gong/Logicogonist-519359.mp3` | [519359](https://freesound.org/people/Logicogonist/sounds/519359/) | Logicogonist | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 共鳴長尾(C) |
| `public/audio/gong/nkuitse-18654.mp3` | [18654](https://freesound.org/people/nkuitse/sounds/18654/) | nkuitse | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 攻擊敲擊(D) |

**下載日期**:2026-05-15(rebase 到 main `a1bb932` 之後)
**下載來源**:freesound.org 公開預覽 mp3(`cdn.freesound.org/previews/`)
**檔案位置**:`public/audio/gong/`(沿用此目錄;雖然名稱是 drumGong,目錄保留 `gong/` 避免改路徑)

## 為什麼即使 CC0 還是要紀錄

[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) **不要求**署名,法律上我們可以完全不提來源。但仍紀錄的理由:

1. **追溯能力** — 如果未來想換音色、找類似風格的鑼,直接從 freesound ID 倒推作者其他作品最快
2. **授權證據** — 萬一上游(極小機率)被指控盜用 CC-BY 素材冒充 CC0,我們有「下載當下標的就是 CC0」的紀錄;對個人專案這風險近乎零,但留個紀錄成本也近乎零
3. **開源社群禮貌** — freesound 創作者期待(雖然不強制)使用者紀錄出處,讓他們的貢獻被看見

## 為什麼新增 drumGong 而不是取代原 gong

詳見 `docs/DECISIONS.md` §1「音效:為什麼自合成 Web Audio 而不是用 mp3 檔?」與翻案紀錄。簡要:zoe 想要一個更接近真實鑼聲的選項(用於課堂/會議的「敲鑼打鼓」感),但原合成 gong 也想保留(簡潔、無檔案依賴)。所以 drumGong 是**新增的第 4 個音效**,使用者可以在設定面板自由選擇。

## 不適用的素材

我們**沒有**使用 bigtimer.net 的 `Gong.mp3` / `Tick.mp3`,即使聲音接近 — 因為:

- bigtimer.net 的 attribution 頁(`/about` 內的 "Copyright & attributions" 區段)僅列字型與程式庫,**沒有公開的音效授權聲明**
- 商業網站的私有素材直接複用有版權風險

mockup 試聽過程中曾下載 bigtimer 的 mp3 作為「對比目標」,但這些檔案**僅存在於 worktree 的 audio/ 目錄供試聽用,不會進 commit、不會部署到 production**。
