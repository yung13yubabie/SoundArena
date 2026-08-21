# 投稿刪除重投、我的狀態頁播放、音檔留存清理

使用者接連提出三項要求:繼續前一輪的收尾項目(狀態頁播放、留存清理)、投票開始前允許刪除重投、確認匿名投票的資料完整性。前兩項是功能,第三項先用真實程式碼追蹤 + PoC 驗證,結果記在下面。

## 投稿刪除重投,只在投票開始前開放

`delete_own_submission()` RPC:只允許本人、只允許這一輪 `now() < voting_opens_at`(或根本沒設定投票時間)時刪除。投票一旦開始就不給刪——如果那時候刪除,`ON DELETE CASCADE` 會把已經投給這篇作品的 `votes` 一起清掉,等於默默抹掉別人已經投出去的票,這是不能接受的,所以刻意做成硬性擋掉,不是「軟性建議」。刪除同時把 B2 上的音檔也清掉(Next.js 層呼叫 `deleteAudioObject()`,Postgres 沒辦法直接打 B2 API)。刪除之後 `unique(round_id, registration_id)` 的位置空出來,可以直接呼叫 `submit_entry()` 重新投稿。

**過程中抓到一個真實的函式重載 bug**:上一輪幫 `submit_entry()` 加 `p_audio_object_key` 參數時用的是 `create or replace function submit_entry(...8個參數..., p_audio_object_key text default null)`,但 Postgres 的 `create or replace` 只有在參數列表完全相同時才會真的取代舊函式——多了一個參數,Postgres 判定成不同函式,結果是新舊兩個版本同時存在。真實 PoC 測「刪除後重新投稿」(呼叫 `submit_entry()` 只帶原本 8 個參數,不特別帶 `p_audio_object_key`)時,PostgREST 直接回 `PGRST203 Could not choose the best candidate function`——因為 8 個具名參數的呼叫方式,新舊兩個重載都能接受,PostgREST 沒辦法判斷該呼叫哪一個。Next.js 這邊的 `submitEntry()` 一律會明確帶上 `p_audio_object_key`(即使是 null),所以正常流程沒有真的壞掉,但這個隱患本身就不該留著。

寫了一支暫時的診斷 function 掃過整個 public schema(`pg_proc` 依函式名稱分組,找出同名超過一次的),確認整個資料庫只有這一個地方有這個問題,另外還有一個無害的殘留(`check_suno_verify_rate_limit()` 從無參數改成 `(p_code text)`,舊的無參數版本沒清掉,但因為兩者參數需求完全不重疊,不會造成呼叫歧義,純粹是死程式碼)。兩個都已經清掉,診斷用的 function 也已經移除。**這件事這輪的教訓**:改一支已經在用的 function 的參數列表時,要嘛簽章完全不變(讓 `create or replace` 真的取代),要嘛先明確 `drop function` 舊簽章再建立新的——不能只靠加預設值蒙混過去。

## 我的狀態頁接上真的播放功能

`/status` 頁原本是純伺服器渲染,把整個投稿清單區塊抽成新的 client component `StatusSubmissionsList.tsx`,管理 `nowPlayingId` 狀態、接上跟 `CompetitionBrowser`/`VoteList` 同一支 `PlayerBar`。這裡看到的是投稿者自己的作品,不受 `allow_public_playback`/審核狀態限制——本來就該讓自己隨時確認上傳有沒有成功。

## 音檔留存清理(前三名保留,其餘清除)

`cleanupNonFinalistAudio()` Server Action:先確認決賽的投票已經截止(整場比賽完全結束,不逐輪清,呼應使用者之前的決定),重用既有的 `getRoundResults()`/`computeRanking()`(跟 `/results` 公開頁同一套排名邏輯,不重寫第二份算法)算出決賽前三名對應的報名者,清除這些人以外、任何一輪上傳過的音檔(B2 檔案 + DB 的 `audio_object_key`),前三名如果初賽也上傳過音檔一併保留,不只保留決賽那一筆。`clear_submission_audio()` RPC 做實際的欄位清除,要求呼叫者有這場比賽的 `'format'` 權限。這是主辦人手動觸發的動作(在 `/admin/format` 比賽名稱設定區塊旁邊),不是自動化排程——這個專案目前沒有 cron/背景工作的基礎設施,手動觸發是務實的第一版,自動化留給之後有需要再做。

用真實帳號 PoC 驗證過:陌生人呼叫 `clear_submission_audio()` 被拒絕、比賽的主辦人呼叫成功且 DB 欄位真的被清空。

## 匿名投票資料完整性:追蹤結果(使用者要求確認,沒有發現問題)

使用者擔心「投票當下顯示 A,結果開票算到 B」。完整追蹤了從投票到計分的整條路徑:

1. `VoteList.tsx` 每張卡片的投票按鈕在 `onClick` closure 裡直接捕捉這張卡片的真實 `submission.id`(`onClick={() => vote(s.id)}`),不是陣列索引——即使匿名輪次會把顯示順序打亂(`shuffle(items)`),打亂的只有畫面呈現順序,每個按鈕綁定的還是自己那筆真實的 UUID。
2. `castVote(roundId, submissionId)` 把這個 UUID 原封不動送到 `vote/actions.ts`,最終寫進 `votes.submission_id`。
3. 計分/結果頁的票數計算(`get_round_scores()` RPC)是一條有 `WHERE v.submission_id = s.id` 的相關子查詢(correlated subquery),對每一筆投稿各自獨立計算屬於自己的票數,不是靠陣列順序或任何外部排序對應——這在資料庫層面上就physically不可能把 A 的票算到 B 頭上。

**結論:沒有找到會把票算錯投稿對象的路徑**,從投票到計分全程都是用真實 UUID 一路對應到底,沒有任何一個環節依賴顯示順序。

## 「我轉為主辦也看不到匿名身份」的確認

追蹤了 `/judge`(評分頁)的程式碼:不管是不是主辦人本人,一律顯示「匿名作品 #N」,這是寫死的(不受 `round.is_anonymous`/揭露時間影響),程式碼裡本來就有註解講清楚這個設計意圖(「為了維持評分時不受作者身份影響,這裡一律顯示匿名作品,即使你是主辦本人」)。`/vote`(投票頁)則是依 `round_identity_revealed()`(未標記匿名 → 一開始公開;標記匿名 → 投票截止才公開)決定要不要顯示標題/作者,這個判斷不因為呼叫者是誰而不同,是純粹依「這一輪的匿名設定 + 現在時間」計算的結果。**評分永遠匿名,投票在匿名輪次投票期間對所有人(含主辦人)一致隱藏,直到投票截止才依規則公開**——這個保證不是只針對一般投票者,主辦人本人在系統設計上也受同樣的規則約束。

（`/admin/review` 這個審核投稿的畫面則不受這個規則限制,主辦人審核投稿時本來就需要看到真實身份去核對 Suno 帳號是否相符——這是投票開始前的另一段流程,不是「匿名投票」的一部分,這裡特別澄清避免混淆。）
