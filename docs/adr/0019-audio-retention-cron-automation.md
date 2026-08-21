# ADR-0019：音檔留存清理自動化 + 留存政策文案

延續 ADR-0018 的音檔留存清理功能——那一版是主辦人手動觸發（`/admin/format` 頁面按鈕），這一版補上自動化排程當保底，並把留存政策寫進使用者看得到的文案裡。

## 排名/清單判斷邏輯抽成共用函式

`cleanupNonFinalistAudio()` 原本把「決賽是否已截止投票」「決賽前三名是誰」「哪些人的音檔該清」這幾段判斷直接寫在 Server Action 裡。手動觸發跟自動排程都需要同一套判斷，抽成 `web/src/lib/audioRetention.ts` 的 `planAudioRetention(supabase, competitionId)`：吃一個 Supabase client（可以是走 RLS 的一般 client，也可以是 service_role client）跟比賽 ID，回傳「比賽是否已完全結束」+「該清除哪些投稿的音檔」，不直接動手清——留給呼叫端各自決定怎麼執行。排名判斷沿用既有的 `getRoundResults()`（跟 `/results` 公開頁同一套邏輯），不重寫第二份算法。

## 自動排程用 Vercel Cron + service_role，不透過 RPC

新增 `web/src/app/api/cron/cleanup-audio/route.ts`，用 `web/vercel.json` 設定每天一次（`0 18 * * *`，UTC，對應台灣時間凌晨 2 點）呼叫。這支路由：

1. 用 `CRON_SECRET` bearer token 驗證呼叫者真的是 Vercel Cron，不是任何人都能打（照 Vercel 官方文件建議做法）。
2. 用 `createServiceClient()`（service_role）直接對 `submissions.audio_object_key` 下 `.update()`，**不透過** `clear_submission_audio()` RPC。

第 2 點是刻意的：`clear_submission_audio()` 的權限檢查靠 `can_manage_competition(..., 'format')`，而這個函式依賴 `auth.uid()`——cron job 沒有真正的使用者身份，`auth.uid()` 在 service_role 底下會是 `null`，呼叫 RPC 一定會被擋下來（這是這個 session 稍早處理 `revoke_organizer()` 時就踩過、學到的同一個坑）。service_role 本來就不受 RLS/GRANT 限制，直接寫表格是正確做法，不是繞過安全機制——這是一個真正的系統背景工作，不是偽裝成使用者的請求。手動觸發（主辦人在 `/admin/format` 按按鈕）走的還是原本的 RPC 路徑，權限檢查完整保留；cron 只是「主辦人忘記手動清」的保底。

單一物件的 B2 刪除失敗不會擋住整批清理（`try/catch` 吞掉單筆錯誤繼續下一筆）——B2 檔案沒刪成功但 DB 欄位還是清掉，好過因為一筆失敗讓整批都卡住。

## 真實驗證：401/401/200 三段式 curl 測試

部署後用 `curl` 對正式站的 `/api/cron/cleanup-audio` 做了三次真實請求：不帶 `Authorization` header → 401；帶錯誤的 secret → 401；帶正確的 `CRON_SECRET` → 200，回傳 `{"ok":true,"processed":[]}`。

`processed: []` 一開始看起來像沒測到東西，但另外用 service_role 直接查了一次 `rounds` 表——目前資料庫裡沒有任何一場比賽的決賽輪 `voting_closes_at` 已經過期，所以「沒有任何比賽該清」是資料現狀決定的正確結果，不是端點壞掉回空的假象。等真的有比賽跑完全部賽程，下一次排程觸發時才會看到 `processed` 裡有內容。

## `CRON_SECRET` 只進 `.env.local` 跟 Vercel production 環境變數，不進 repo

產生一組隨機字串存進 `web/.env.local`（確認過 `web/.gitignore` 有 `.env*` 規則，不會被 commit 進去），另外用 `vercel env add CRON_SECRET production --force` 同步到正式環境。

## 留存政策文案：報名頁、投稿頁、狀態頁三處

使用者問「音檔留存清理 寫在報名說明/淘汰說明會不會比較好」——答案是兩個都寫，另外加投稿頁上傳說明一起補：

- **報名頁**（`RegisterForm.tsx` 開頭說明段落）：報名前就先讓參賽者知道規則，包含「投票開始前可自行刪除投稿並重新上傳」（ADR-0018 的功能）跟音檔留存政策。
- **投稿頁**（`SubmitForm.tsx` 上傳區塊下方的說明文字）：上傳當下再提醒一次，跟「不上傳只留 Suno 連結」的既有說明放在一起，邏輯上是同一件事的兩面。
- **狀態頁**（`StatusSubmissionsList.tsx` 的淘汰通知區塊）：被淘汰的參賽者不會進決賽前三名，音檔一定會被清——這是對這群人最直接相關的時機點，原本的淘汰提示下面加一行小字說明。

三處文案一致強調「Suno 連結不受影響，仍可點擊收聽」，避免參賽者誤以為作品會完全消失。
