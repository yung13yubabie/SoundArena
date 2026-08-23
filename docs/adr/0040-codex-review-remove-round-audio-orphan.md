# ADR-0040:Codex adversarial review 抓到——`remove_round()` 強制移除時,B2 音檔沒有被追蹤

批次 1~8 全部完成後,照 `/goal`(「CODEX REVIEW 留到最後」)指示,對批次開始前的基準 commit(`881639e`)到 `HEAD` 的完整累積差異跑 `/codex:adversarial-review`。結果 `needs-attention`,抓到一個真實的高風險發現。

## 發現

批次 3(ADR-0038)修 `remove_round()` 時,重點放在「不讓真實資料被默默刪掉」,補上了 PlatformAdmin 強制移除的資料保護邏輯——但沒有比照同一個 session 稍早(ADR-0035/DB-08)已經建立的 `audio_pending_deletion` 追蹤慣例。PlatformAdmin 強制移除有真實投稿的輪次時,`submissions.round_id` 的 cascade 會把底下投稿(含唯一記載 B2 音檔位置的 `audio_object_key`)一起刪掉,B2 上的音檔會變成永久孤兒——`cleanup-audio` cron 只掃 `audio_pending_deletion` 這張追蹤表,沒有任何紀錄可以讓它找到這些檔案。

這是同一類問題在 session 內第三次出現(`delete_own_submission()`、`delete_competition()`、現在是 `remove_round()`)——每次新增一個會 cascade 刪掉 `submissions` 的路徑,都要記得同步套用 `audio_pending_deletion` 追蹤,這次批次 3 專注在資料保護本身,漏了這一步。

## 修法

`remove_round()` 回傳型別從 `void` 改成 `text[]`(這輪底下所有投稿的 `audio_object_key`),在真的刪除輪次**之前**,先把即將孤兒化的 key 寫進 `audio_pending_deletion`(`reason='round_delete'`)——跟 `delete_own_submission()`/`delete_competition()` 完全同一套模式。`web/src/app/admin/format/actions.ts` 的 `removeRound()` 改用回傳的 `text[]` 盡力立即清 B2。既有的 `cleanup-audio` cron 掃描邏輯不用改——它掃描的是整張 `audio_pending_deletion` 表,不分 `reason`,`round_delete` 的紀錄會自然被同一套邏輯兜底。

## 驗證

一次性真實 PoC(5/5,對正式 Supabase 環境):PlatformAdmin 強制移除有真實投稿(2 筆)的輪次,回傳陣列正確、兩筆 key 都寫進追蹤表且 `reason` 正確;一般 organizer 移除沒有真實投稿的輪次,回傳空陣列、不產生任何追蹤紀錄(回歸)。`security-regression.mjs` 新增 1 項長期守護(擴充既有的 `remove_round()` 測試,幫原本的測試投稿補上真實 `audio_object_key`),30/30 通過。`tsc`/`eslint`/`build` 全程乾淨。
