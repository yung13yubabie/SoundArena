# ADR-0051:外卡復活戰(wildcard_revival)

原本「特殊機制」分類裡唯二的純標籤之二(另一個是業界導師制,已直接移除,見 HANDOFF)。用 `mattpocock-skills:grilling` 跑四輪收斂設計。

## 設計(grilling 四輪收斂的決定)

1. **適用範圍**:單敗淘汰、循環賽、月/週期累積制——**排除雙敗淘汰**。雙敗淘汰的目錄標籤本身就寫「雙敗淘汰(含敗部復活)」,輸一場還有機會已經是它內建的行為,獨立疊加外卡復活會造成兩套「復活」概念打架,語意混淆。
2. **候選資格池**:只限「最近一輪被淘汰者」——主辦人可以在比賽進行中任何時間點觸發,候選池就是觸發當下最近一次確認結果的那一輪的淘汰名單,不含更早輪次被淘汰的人。
3. **候選人數量**:前 N 名(離晉級線最近的幾位),N 由主辦人自訂——避免某輪淘汰很多人時候選名單過於龐大。排序基準依賽制分岔:循環賽用勝場數(含平局0.5勝)由高到低、月/週期累積制用累積分數由高到低、單敗淘汰沒有分數可排(輸一場就出局),改用「場次票數差距」由小到大(輸得越驚險排越前面)。
4. **選人機制**:開放觀眾投票,不是主辦人手動指定或系統抽籤——候選人顯示的是他們被淘汰那一輪的投稿內容,並且沿用那一輪原本的匿名設定(匿名輪就匿名投票,不額外洩漏身份)。
5. **次數**:整場比賽全程限用一次,用掉就沒有了——不是每輪都能用。
6. **觸發方式**:主辦人手動在後台開啟投票視窗(比照「本輪專屬時程」的操作模式),自己設開始/截止時間,不是系統自動判斷時機。
7. **時間窗限制(工程約束,已跟使用者確認可接受)**:只能在「某輪確認結果之後、到緊接著下一輪配對正式產生之前」這段期間觸發——一旦下一輪配對已經形成,這次機會就算錯過(但因為是整場限用一次不是每輪限用一次,主辦人晚一點在別輪還有機會)。這個限制避免要把復活的人硬塞進已經排好的對戰名單,是最安全的做法,不需要重新洗牌已經產生的分組/配對。
8. **平手處理**:確認結果時偵測到最高票不只一人(平手),整個拒絕確認,列出平手的候選人,主辦人可以延長投票時間等更多人投票後再重新確認——跟單敗/雙敗淘汰「確認本輪結果」平手擋下同一套邏輯。

## 實作

新建三張表(不跟 `matches`/`match_votes`共用,語意完全不同——候選人是已淘汰者,不是這輪的正常對戰):
- `wildcard_revival_events`:一場比賽最多一列,`unique(competition_id)` 在資料庫層面直接保證「整場限用一次」,不需要額外狀態欄位追蹤「用過了沒」。
- `wildcard_revival_candidates`:候選名單在開啟投票當下就算好、寫死,不是投票結束時才重算——避免之後幾輪的淘汰結果反過來改變候選資格。
- `wildcard_revival_votes`:比照 `match_votes` 已驗證過的 pattern(`voter_id`+`voter_ip` 去重、不開放 `authenticated` 直接 INSERT,寫入只能走 `service_role` 的 Server Action)。候選人不能投給自己(比照 `votes` 表原本的規則,不是比照 `match_votes` 那種「參賽者完全不能投這場」——外卡候選人可能有3位以上,投給別的候選人不算利益衝突)。

`open_wildcard_revival_event()` RPC:候選名單排序演算法(哪些人算「離晉級線最近」)由呼叫端(TS 層,`lib/wildcardRevival.ts` 的 `computeWildcardRevivalCandidates()`)算好再傳進來,RPC 只驗證每個候選人真的是 source_round 淘汰的人、下一輪還沒產生分組/配對(`teams`/`pools`/`matches` 任一張表有資料就擋)——理由跟 `finalize_round_results()` 一樣,避免 SQL/TS 兩邊排名演算法各自漂移。`resolve_wildcard_revival_event()` 同樣不算票,贏家由 `computeWildcardRevivalOutcome()` 算好傳進來,套用後把這個人的 `registrations.status` 改回 `active`。另外補了 `extend_wildcard_revival_voting()`,平手時延長投票截止時間用。

`computeWildcardRevivalCandidates(supabase, ...)` 混用兩種 client:重用 `getJudgeScoringData()`/`getPeriodicAccumulationStageRoundIds()` 的月週期累積制/一般%淘汰分支需要呼叫端(主辦人)自己的 session client——底層 `judge_submissions_for_round()` RPC 權限閘靠 `auth.uid()` 判斷,service_role 呼叫會直接被擋成空結果;循環賽/單敗淘汰分支需要讀 `match_votes`(RLS 只開放自己查自己投過誰),函式內部另外開一個 service client 讀,只有這個受信任的 server action 流程會呼叫到。

**UI**:`/admin/format` 新增 `WildcardRevivalPanel`(競賽層級,不是輪次層級,放在頁面最下方)——沒開過就顯示開啟表單(候選人數、投票時間),開過就顯示候選人名單/投票時程/確認結果按鈕/平手時的延長時間工具。新增獨立路由 `/vote/wildcard?event=<id>`(不掛在既有 `/vote?round=` 底下,因為投票視窗來源不是輪次自己的 `voting_opens_at`,是事件自己的時程),`/vote` 首頁的輪次選擇器額外列出目前開放中的外卡復活投票入口。

## 驗證

真實 PoC(對正式 Supabase 環境,`lib/wildcardRevival.ts` 有 `import "server-only"` 無法用 `npx tsx` 直接 import,對照真實資料庫重新實作同一套排序/平手偵測邏輯驗證):循環賽勝場數排序(含平局0.5勝)正確、單敗淘汰票數差距排序正確、兩位候選人平票時正確偵測平手、補票打破平手後正確回報贏家——4/4 通過(過程中抓到自己在 PoC 裡手算勝場數時的一個計算錯誤,不是演算法本身的 bug,修正測試期望值後複跑通過)。

`security-regression.mjs` 新增 12 項(RPC 邊界):陌生人擋下開啟、候選名單驗證(塞非淘汰者拒絕)、正常開啟成功、整場限用一次(unique 擋第二次)、候選人不能投自己、投給非候選人拒絕、正常投票、同人不能投兩次、投票未截止不能確認結果、確認結果後贏家狀態改回active、已確認結果不能再延長投票、下一輪配對已產生時開啟被擋下——82/82 全部通過。`tsc`/`eslint`/`build` 全程乾淨。

**尚未驗證**:`/admin/format` 的 `WildcardRevivalPanel`、`/vote/wildcard` 投票頁,沒有經過瀏覽器肉眼驗證。

## 未涵蓋(刻意延後)

沒有做「主辦人取消已開啟但還沒確認的外卡復活投票」功能——一旦開啟,只能等投票截止後確認或延長時間,不能反悔關掉(unique(competition_id) 也不允許重開)。如果之後真的需要這個彈性,要另外設計「作廢事件」的路徑,目前沒有需求先不做。
