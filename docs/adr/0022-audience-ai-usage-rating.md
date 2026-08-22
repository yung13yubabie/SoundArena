# ADR-0022:觀眾投票時順便給「AI 使用方式」星等評分

延續 ADR-0021——評審評「AI 使用方式」,但使用者這輪要求觀眾也要能評同一個維度,不只是評「整體吸引力」的單一票選。

## 決策記錄(使用者這輪明確選擇)

1. **評分入口**:綁在投票的同一個動作(不是獨立的瀏覽頁評分)——投票時順便給星等,不是另開一個評分頁面。
2. **評分方式**:1-5 星評分(不是二選一)。
3. **要不要算進最終排名**:算進去,當第 6 個 score_item 模板,主辦人自己分配權重,建築方式延續 ADR-0021 的合併模式(不拆成獨立排名)。

## 為什麼直接加欄位在 `votes`,不開新表

投票本來就是「每人每輪最多一票」(`unique(round_id, voter_id)`),評分是「對這張票投的那首作品順便評」,語意上是同一列資料的延伸,不是獨立的多對多關係——不需要平行的 `ai_usage_ratings` 表。`votes` 新增 `ai_usage_rating smallint`(nullable,check 1-5),評分選填,不填就是 `null`,`get_round_scores()` 計算平均值時排除 null(不是當 0 分拉低平均)。

## 資料流

`supabase/migrations/20260822050000_audience_ai_usage_rating.sql`:

- `votes` 新增 `ai_usage_rating` 欄位 + range check constraint。
- `score_item_templates` 新增 `audience_ai_usage_rating`(觀眾 AI 使用度評分,weighted)。
- `get_round_scores()` RPC(給 `/results` 公開結果頁用)新增一個 CASE 分支:`avg(votes.ai_usage_rating) where ai_usage_rating is not null`,跟既有的 `vote`(count)、`comment_endorsement`(sum)分支並列。**這裡簽章跟回傳型別都沒變,單純 `create or replace` 就正確取代**——跟 ADR-0020/0021 那種改參數列表/改回傳欄位、必須先 `drop function` 的情況不同,這次刻意選了「只改內部邏輯」的安全路徑。

`/judge` 頁面(`judge/page.tsx`)有自己獨立於 `get_round_scores()` 的即時計算邏輯(因為 `get_round_scores()` 只在「公開比賽 + 投票已截止」才回傳資料,評審打分需要在投票還開放、甚至私人比賽時就能即時看到觀眾目前的平均星等)——`votes` 查詢多選 `ai_usage_rating` 欄位,額外算一份 `ratingSums` map,`JudgeBoard.tsx` 把 `audience_ai_usage_rating` 模板跟 `vote` 一樣標成「系統自動」(唯讀,不能被評審手動覆蓋),顯示格式改成「平均 X.X 分」。`/results` 公開頁同樣的顯示邏輯做了對應調整。

## 應用層

- `web/src/app/vote/actions.ts`:`castVote()` 新增 `aiUsageRating: number | null` 參數,伺服器端驗證範圍(1-5 整數或 null)後一併寫進 `votes` insert——沿用既有的 service_role 寫入路徑(ADR-0012),不是新開一個寫入管道。
- `web/src/app/vote/VoteList.tsx`:每張作品卡片在播放/投票按鈕之前新增 1-5 星選擇器(選填),只在「還沒投票、且不是自己的作品」時顯示;點擊「投這首」時把當下選的星等一起送出。投票完成後星等就跟著那一票鎖定,不能再改。

## 真實 PoC(6/6 通過)

一次性測試帳號 + 真實 session,涵蓋:新模板存在、三筆投票(含一筆刻意不給星等)正確寫入、超出 1-5 範圍的星等被 DB check constraint 拒絕、`get_round_scores()` 正確算出平均值(驗證未評分的票不拉低平均,而是被排除)、`vote` 計數不受影響(回歸)、`judge_submissions_for_round()` 在新增欄位後仍正常運作且不洩漏身份(回歸,呼應 ADR-0020)。

`tsc`/`eslint`/`build` 全程乾淨(eslint 剩 2 個跟本次改動無關的既有警告)。
