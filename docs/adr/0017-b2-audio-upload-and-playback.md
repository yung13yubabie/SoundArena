# B2 音檔上傳 + 站內播放

`storage.ts` 的基礎設施(`uploadAudioObject`/`getPlaybackUrl`/`deleteAudioObject`)從上個 session 就存在,但完全沒有使用者介面——投稿頁的上傳區塊是純裝飾(已在獨立複查那輪換成誠實的「還沒開放」提示),`PlayerBar.tsx` 也是純假資料(播放中狀態、進度條時間全部寫死,沒有任何真實 `<audio>` 元素)。這輪把整條路徑做完:上傳、儲存、播放。

## 上傳:瀏覽器直接 PUT 到 B2,不繞道我們的伺服器

音檔可能有幾十 MB,不適合塞進 Server Action 的 body size 限制,所以採用 S3 相容儲存服務的標準模式:瀏覽器先跟我們要一個短效(10 分鐘)的簽章 PUT 網址,再直接把檔案傳給 B2。`storage.ts` 新增 `createUploadUrl()`,對稱於既有的 `getPlaybackUrl()`。

`requestAudioUpload()` Server Action:驗證登入、驗證檔案格式(mp3/wav/m4a/ogg/flac 白名單)、驗證大小上限(60MB)、驗證這筆報名真的屬於呼叫者本人,才產生 key(`submissions/{registrationId}/{uuid}.{ext}`)。`submit_entry()` RPC 也在 DB 端重新驗證 key 格式跟歸屬(不能拿別人報名底下的 key 冒充),雙層防護,呼應這個專案一路建立的慣例。

上傳過程部署當下就發現一個真實的問題:B2 bucket 的 CORS 設定只開放 `GET`/`HEAD`(當初只是為了播放簽章網址),沒有 `PUT`——瀏覽器直接打 B2 會被 CORS 擋下。已補上一條專門給 PUT 用的 CORS 規則(正式站網域 + 本機測試用的 localhost)。

## 播放:PlayerBar 從假資料改成真的 `<audio>` 元素

`getSubmissionPlaybackUrl()` 用一般(受 RLS 限制)的 client 查 `audio_object_key`——查不查得到這個欄位本身就是權限判斷,不需要另外重複寫一次「這個人能不能看這筆投稿」的邏輯。查到 key 才呼叫 `getPlaybackUrl()` 簽出短效播放網址;沒有上傳過音檔的作品回傳 `null`,UI 退化成「到 Suno 上聽」的外部連結,不是硬錯誤。

`CompetitionBrowser.tsx`(探索比賽的公開試聽)跟 `VoteList.tsx`(投票頁)都接上這支新的 PlayerBar。**匿名投票輪次刻意不提供 Suno 連結當備援**——點開 Suno 連結會直接看到作者的 Suno 帳號,在還沒公開身份的階段等於洩漏身份,只有 `revealed=true` 時才傳 `sunoShareUrl` 給 PlayerBar。

## 這輪沒有做的部分

- **`/status` 頁(投稿者自己確認上傳結果)還沒接播放**——目前只能透過 `/competitions`(如果有開公開試聽)或 `/vote`(審核通過進入投票後)確認,純粹是時間考量,之後可以直接複用同一支 `PlayerBar`。
- **前三名保留音檔、其餘淘汰後刪除**的留存政策——這輪只做到「上傳跟播放能動」,自動化的清除機制(判斷比賽真的整場結束、判斷誰是前三名、呼叫 `deleteAudioObject()`)還沒做,上一輪就已經記錄成「等上傳功能做出來再一起處理」,現在功能做出來了,可以排進下一批。
