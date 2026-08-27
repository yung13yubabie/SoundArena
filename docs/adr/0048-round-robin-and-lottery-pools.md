# ADR-0048:循環賽(round_robin)+ 抽籤分組(lottery)

賽制細節填空第三批。使用者選「循環賽」作為下一個要做的賽制,理由是它比單/雙敗淘汰簡單——沒有樹狀晉級路徑,只是「大家兩兩打完全部場次,依勝場數排名」的平面結構。經過三輪 `mattpocock-skills:grilling` 收斂出完整設計。

## 設計(grilling 三輪收斂的決定)

1. **對戰單位**:只有個人,不跟既有的隊伍分組(team)互動——最小地基先蓋完,之後要不要接體再說。
2. **輸贏判定**:觀眾對每場配對(A vs B)單獨投票,計票多的一方贏這場;5:5 平票算平局,雙方各得 0.5 勝——不是套用現有 `scoring_rules` 加權公式比分數大小(那套是「作品獨立打分排名」,不是「兩兩對戰」)。
3. **場次時程**:整個循環賽賽程容納在同一個既有輪次(round)內部,不拆成好幾個輪次——新建 `matches` 表,同一輪內同時存在好幾場配對,投票/評分視窗跟這一輪一致。
4. **規模控制**:先用「抽籤分組」(lottery,補上真的行為)分池,再池內循環——主辦人填「每池人數上限」,系統依報名人數自動算出要分幾池、均勻分配(沿用組隊賽已驗證過的均分打散演算法)。分池的觸發時機完全比照組隊賽(報名截止/前一輪確認結果 lazy check)。
5. **資料表**:`pools`/`pool_members`(分池)、`matches`(配對場次)、`match_votes`(配對投票)——刻意跟 `teams`/`team_members`、`votes` 分開,語意不同(競賽對手池 vs 合作提交單位;一輪多票 vs 一輪一票),不共用表結構,避免既有邏輯(`external_vote` 計分、`teams` 未來的合作提交發展)被牽連。
6. **淘汰配額接軌**:循環賽打完後的最終排名依「勝場數」(含平局的 0.5),套用既有的 `elimination_percent` 自動淘汰機制——排名基準從「加權分數」換成「勝場數」,其餘邏輯(floor(%×活躍人數)、冪等鎖定、同分 tiebreak)完全不變。

## 實作

**Postgres**:`pools`/`pool_members`/`matches`/`match_votes` 四張新表 + RLS。`form_lottery_pools_for_round()` 幾乎是 `form_team_groups_for_round()` 的變體(判斷式換成 `fb.key = 'lottery'`,人數控制從「填組數」換成「填每池人數上限、系統算 `ceil(總人數/上限)` 出組數」)。`generate_round_robin_matches_for_round()` 在每個池內用巢狀迴圈產生所有 `C(n,2)` 兩兩配對,冪等(已有場次的輪次直接跳過)。`match_votes` 比照 `votes` 表的既有模式:INSERT 完全不開放給 `authenticated`(voter_ip 只有 Next.js 層量得到真實值,寫入一定要走 service_role,見 `castMatchVote()`),用 `BEFORE INSERT` trigger(`check_match_vote_validity()`)驗證自投防範跟「選擇的對象確實在這場配對裡」。

**排名計算**:比照 ADR-0045/0047 的既有原則,不在 SQL 裡重算——`lib/roundRobin.ts` 的 `computeAndPersistMatchWinners()` 在「確認本輪結果」時才結算每場配對的贏家(不是投票期間即時算,避免提前看出風向),寫回 `matches.winner_registration_id`,回傳每個人的勝場數。`judge/actions.ts` 的 `finalizeRoundResults()` 新增第三個分岔(循環賽 / 月週期累積制 / 一般單輪):循環賽用勝場數當排名基準,其餘沿用既有的 floor/sort/tiebreak 邏輯。

**UI**:`/admin/format` 新增 `PoolConfigPanel`(每池人數上限)+ `MatchesPanel`(唯讀顯示分池結果跟場次,標示贏家)。`/vote` 頁面偵測到這輪選了「循環賽」,整個換成 `MatchVoteList`(逐場配對投票,不是自由多選一的 `VoteList`)——播放雙方作品、對自己不是參賽者的場次可以投票、已投的場次顯示已投狀態。

## 過程中抓到的兩個真實 RLS 缺口

寫 `/vote` 頁面時發現:①`match_votes` 完全沒開放任何 SELECT policy,連投票者自己查「這場我投過誰」都查不到——`votes` 表有對應的「自己可以查自己投過誰」policy,`match_votes` 一開始漏了。②`pools` 的 SELECT policy 一開始只給 review 權限持有者,但一般登入使用者要投票也需要讀到池名稱——補了一支給 `authenticated` 讀的 policy。兩者都是在串接前端時對照真實需求才發現,不是憑空猜的。

## 驗證

真實 PoC 兩層,對正式 Supabase 環境:①手動複製核心演算法(池分組均分打散、配對場次生成)對照真實資料庫,②`lib/roundRobin.ts` 有 `import "server-only"`,無法用 `npx tsx` 直接 import(套件的保護機制判斷這不是合法的 Next.js server 環境),改成在 PoC 裡對照真實資料庫重新實作同一套計票邏輯驗證——15/15 通過,涵蓋:5人分2池(3、2 均分打散)、每池內產生正確數量的兩兩配對且冪等、得票多方正確判定贏家、平票正確記錄為平局、沒人投票也正確記錄為平局、自投防範、選錯配對對象防範、勝場數正確累加(含同一人多場對戰的情況)、確認結果時陌生人被擋、循環賽排名基準(勝場數)算出的淘汰名單正確套用。`security-regression.mjs` 新增 8 項長期守護。`tsc`/`eslint`/`build` 全程乾淨。

**尚未驗證**:`/vote` 的 `MatchVoteList` 新畫面沒有經過瀏覽器肉眼驗證,原因同前幾批——沒有現成登入 session。

## 未涵蓋(刻意延後)

單/雙敗淘汰的對戰配對設計——需要真的的樹狀晉級路徑(誰贏誰晉級跟誰打、雙敗的敗部怎麼運作),跟這批的平面結構完全不同,是完全獨立的下一批。
