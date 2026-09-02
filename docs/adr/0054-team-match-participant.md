# ADR-0054:隊伍賽真正支援對戰單位

「隊伍賽」(team grouping)原本純粹是社交/組織分組——`form_team_groups_for_round()` 把還在比賽中的個人報名者隨機均分打散進幾隊,建立 `teams`/`team_members`,發 Discord 通知讓隊員知道隊友是誰。投稿、投票、計分、淘汰全部還是以個人 registration 為單位進行,team 對這些流程零影響。ADR-0044(組隊賽亂數分組)當初就明確把「團隊單一合作作品的投稿流程」列為刻意延後的下一批工作。Codex 對抗式審查第二輪也發現「隊伍賽疊加單敗/雙敗淘汰/循環賽時配對邏輯完全用個人為單位,組好的隊伍純裝飾」,先用 `set_round_format_block()` 的互斥檢查暫時擋下這個組合(ADR-0052/0053)。這次用 `mattpocock-skills:grilling` 跑十輪以上收斂完整設計,解除互斥、讓這個組合真正有意義運作。

## 設計(grilling 逐輪收斂的決定)

1. **投稿模式**:一隊共用一筆正式投稿,但不是「只有隊長能上傳」——隊內任何人都能上傳候選版本(各自最多一筆,沿用既有 `submissions` 的 `unique(round_id, registration_id)` 不用改),只有隊長能執行「正式送出」把某一筆候選版本標記成這隊的官方投稿。未被選中的候選版本保留當歷史紀錄,不刪除。投稿截止時隊長還沒送出,系統自動選最後一筆候選送出(不是視為沒投稿)。
2. **投稿擁有權與隊長轉讓脫鉤**:隊長轉讓不會讓既有候選版本的上傳者歸屬跟著換人——每筆投稿永遠記錄真正上傳它的那個人。
3. **淘汰單位**:全部改成整隊一起淘汰——不只是配對制(單敗/雙敗/循環賽),連一般 %自動淘汰也是砍「隊伍」再展開成隊內全部現役成員一起標記淘汰,不會讓同一隊只剩一半人。
4. **隊伍跨輪次是否固定**:兩種行為並存,依賽制分岔——
   - `single_elimination`/`double_elimination`/`round_robin`/`periodic_accumulation`(合稱「持續性賽制」)底下的隊伍賽,隊伍組成跨輪次維持不變(贏了才晉級、晉級後隔壁隊伍還是同一批人)。`periodic_accumulation` 尤其是硬性要求——累積分數需要一個持續存在的單位,不能每輪重新洗牌,这一點是在確認「一般%淘汰維持每輪重新分組」之後才發現的衝突,追加把它從「重新分組」搬進「持續固定」這一類。
   - 一般 %淘汰(`elimination_percent`,沒有掛上述四種賽制標籤)維持 ADR-0044 原本的「每輪重新隨機分組」行為。
   - 「stage」= 從某一輪開始,連續幾輪都掛著 team 分組 + 持續性賽制之一,整段共用同一批 teams(在 stage 第一輪形成,後續輪次直接沿用,不重新分組)。一旦某輪不再符合這個條件,stage 就中斷,回到當輪重新分組。
5. **隊長**:分組時系統隨機指定隊內一人,之後可以轉讓給隊上任何一人。呼叫轉讓的人必須是「目前的隊長本人」或「對這場比賽有 review 權限的主辦人/協作者」(給主辦人一個手動介入的後路,例如隊長帳號無法使用時)。
6. **可異動性**:通過後就算已經分好組、甚至已經產生真實賽程資料,主辦人後台仍然可以手動換組(沿用既有 `swap_team_member`,不用改)——後台需要有隊員名單面板,不能只在資料庫裡看得到。
7. **外卡復活**:候選資格只復活「個人」,不是整隊復活——復活的人脫離原隊,回到個人賽身份繼續打(這場比賽的外卡復活戰本來就是個人對個人投票機制,不因為源頭賽制是隊伍賽而改變其性質)。但候選名單的排序基準要用「隊伍」的名次/分數(不是把整隊拆散各自比較),排名前 N 名的隊伍裡,每個現役成員都各自進候選池,所以候選池實際人數可能超過 N。復活成功的人系統自動塞進當下人數最少的現役隊伍(不是主辦人手動指定,也不是自己選)。

## 實作

**資料庫**(9 個 migration,`20260830010000` ~ `20260830150000`,詳細清單見 HANDOFF.md 08-30 段落):

- `teams.captain_registration_id`——隊長欄位。`get_team_stage_start_round_id(p_round_id)` 往回走鏈,找到「team 分組 + 持續性賽制」不間斷鏈條的第一輪;`form_team_groups_for_round()` 在持續性賽制底下,非 stage 第一輪直接 `return`(沿用起始輪的 teams,不重新分組),並在分組完成時隨機指定隊長。
- `submissions.team_id`/`is_team_selected`,`submissions_one_selected_per_team_round` partial unique index 保證同隊同輪最多一筆正式送出。`submit_entry()` 新增 `p_team_id` 參數並驗證呼叫者真的是這支隊伍成員;新建 `select_team_submission()`(只有隊長能執行)、`transfer_team_captain()`(隊長本人或 review 權限)、`auto_select_team_submissions_for_closed_rounds()`(截止未選時系統自動選最後一筆)。
- `matches.team_a_id`/`team_b_id`/`winner_team_id`——跟既有 `registration_a_id`/`b_id`/`winner_registration_id` 並存但互斥(team 賽事這幾欄維持 null),獨立欄位是必須的:matches 產生時機早於投稿送出時機,且隊長可轉讓,沒有任何單一 registration_id 能穩定代表「這支隊伍」。連帶 `registration_a_id`/`registration_b_id` 補上 `drop not null`(team 賽事的場次填不出這兩欄)。`generate_single_elimination_matches_for_round()`/`generate_double_elimination_matches_for_round()`/`generate_round_robin_matches_for_round()` 各自新增 team 分岔,查詢 stage 起始輪的現役隊伍配對(round_robin 的 team 分岔直接跳過既有的抽籤分池機制,全部隊伍兩兩配對)。
- `match_votes.chosen_team_id`(`chosen_registration_id` 改 nullable,CHECK 保證兩者恰好擇一)。`check_match_vote_validity()` trigger 新增 team 分岔:`chosen_team_id` 必須是這場的其中一隊,投票者只要是任一隊的成員就不能投(不論投哪邊)。
- `judge_submissions_for_round()`/`get_votable_submissions()`/`get_round_submissions()`/`get_round_scores()` 這四支既有 RPC 全部補上 `(team_id is null or is_team_selected)` 過濾——這是實作中途才發現的必要依賴,不然一隊有好幾筆候選投稿審核通過時,評審/投票者/公開結果會把未被選中的草稿當成獨立投稿看到,分數/排名計算也會被污染。
- `get_wildcard_revival_candidates()` 新增 team 分岔:用 stage 起始輪找候選人所屬隊伍,依隊伍名次排序,展開成隊內全部現役成員進候選池。`resolve_wildcard_revival_event()` 復活成功時,用 `on conflict (round_id, registration_id) do update` upsert 插入人數最少的現役隊伍(自我審查抓到的 bug:被復活的人在同一 stage 已經有一筆屬於原隊的 `team_members` 舊列,naive insert 會違反 unique 約束)。
- `set_round_format_block()` 移除 team + single/double_elimination/round_robin 的互斥檢查;round_robin 的分組要求從「必須是 lottery」放寬成「lottery 或 team」。

**TypeScript**(`web/src/`):`lib/teamGrouping.ts`(新檔,`isTeamGroupingRound`/`getTeamStageStartRoundId`/`computeTeamScoreTotals`);`lib/singleElimination.ts`/`doubleElimination.ts`/`roundRobin.ts`/`wildcardRevival.ts` 各自新增 team 分岔,對外回傳型別維持個人 `registrationId` 清單不變(team 輸家在 lib 內部就展開成現役成員清單),呼叫端(`app/judge/actions.ts`)完全不用感知 team 概念,除了 `elimination_percent` 的一般淘汰分支——這條路徑排序/砍除的單位本來就必須是隊伍(不然可能把同一隊砍到只剩一半人),獨立寫了 team 分岔。`app/submit/actions.ts`/`page.tsx`/`SubmitForm.tsx` 加上候選版本上傳、隊友候選列表顯示、隊長專屬的「選為正式送出」按鈕。`app/vote/page.tsx`/`MatchVoteList.tsx`/`actions.ts` 加上隊伍配對投票(新 `castTeamMatchVote()`)。`app/admin/format/AdminFormatClient.tsx` 的 `MatchData` 欄位從個人專用的 `registrationAId`/`registrationADisplayName`/... 泛化成 `aId`/`aLabel`/`bId`/`bLabel`/`winnerId`(不分個人/隊伍都能顯示,是原本規劃之外、在收尾驗證階段才發現漏掉的部分),`TeamRosterPanel` 加上隊長標示與轉讓下拉選單。

## 驗證

`security-regression.mjs` 新增 21 項隊伍賽情境測試(投稿流程的成員驗證、隊長專屬送出、隊長轉讓的權限邊界與投稿擁有權不隨轉讓改變、四支既有 RPC 的草稿過濾——含「草稿已經有評分紀錄仍要被排除」這個更嚴格的版本、單敗淘汰配對真的用 `team_a_id`/`team_b_id`、配對投票的隊伍防呆),加上既有 Codex 第二輪 Finding2/Finding4 兩項測試因為這次功能上線而改寫(Finding2 從「驗證互斥」改成「驗證新允許組合」;Finding4 更新成新的錯誤訊息文字)。**118/118 全部通過**,過程中抓到並修好 3 個真實 bug(全部由這次新增的測試直接抓到,不是憑空猜測):

- **`submit_entry()` 的 DB-02 權限洩漏重新打開**:Phase 3 對 `submit_entry()` 做 `drop function` + `create function`(改回傳簽章加 `p_team_id`)只補了 `grant ... to service_role`,沒有像上一次修這個函式時(`20260822140000_fix_submit_entry_public_grant_leak.sql`)一樣補 `revoke ... from public, authenticated, anon`——Postgres 新建函式預設 `PUBLIC` 就有 execute,一般 authenticated session 因此可以直接繞過 Server Action 呼叫這支 RPC。
- **`team_members` RLS 自我遞迴**:Phase 1 幫 `team_members`/`teams`/`submissions` 加的「隊員可以看到自己隊伍資料」RLS policy,直接在 `team_members` 自己的 policy 裡子查詢 `team_members` 本身,Postgres 評估時無限遞迴("infinite recursion detected in policy for relation team_members")。這不只是測試會炸——`/submit`、`/vote` 頁面本身用一般使用者 session 查 `team_members` 時也會真的炸掉。改用 `security definer` 輔助函式 `user_is_team_member()`(跟 `can_manage_competition()`/`is_competition_collaborator()` 同一個既有慣例)繞開自我遞迴。
- **`matches.registration_a_id`/`registration_b_id` 漏改 nullable**:這兩欄從建置以來就是 `not null`,team 賽事的場次產生時根本填不出值,真的執行 `generate_single_elimination_matches_for_round()` 時直接違反 constraint 插入失敗——這代表如果沒有這次的真實資料庫驗證,team 模式的單敗/雙敗/循環賽淘汰會在上線當下就完全無法運作。

三個 bug 都用獨立 SQL migration(`20260830160000_fix_team_feature_verification_bugs.sql`)修好並重新 `db push` 到正式環境,`db query` 逐項複查修好後的 grants/nullable/policy 狀態,再重跑整份 `security-regression.mjs` 確認 118/118 全綠。`tsc --noEmit`/`eslint .`/`next build` 全程乾淨。

**尚未驗證**:UI 沒有經過瀏覽器肉眼操作(`/submit` 隊伍候選版本上傳與選定畫面、`/vote` 隊伍配對投票畫面、`/admin/format` 隊員名單與隊長轉讓面板)。`app/judge/actions.ts` 的 `finalizeRoundResults()` team 分岔(整隊一起淘汰的實際 flat-map 邏輯)只做了程式碼審閱 + 型別檢查,沒有像 `lib/wildcardRevival.ts` 當初那樣寫一次性 PoC 直接對照真實資料庫獨立重新驗證排序/展開邏輯——`lib/singleElimination.ts`/`doubleElimination.ts` 的 team 分岔同樣只做了程式碼審閱。

## 未涵蓋(刻意延後)

- 沒有做「隊伍規模不平衡時的特殊處理」——分組沿用既有 `form_team_groups_for_round()` 的均分打散演算法(ADR-0044),持續性賽制下隊伍人數也可能因為 `swap_team_member` 手動換組或外卡復活插入而變得不均,目前沒有额外的平衡邏輯或警告。
- 沒有做「隊伍解散/合併」——只有分組時建立與換組,沒有主辦人手動刪除/合併隊伍的介面。
