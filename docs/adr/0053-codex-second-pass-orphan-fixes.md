# ADR-0053:Codex 第二輪對抗式審查(孤兒節點+相容性缺口)修復

繼 ADR-0052(Codex 第一輪找到 4 個真實安全/邏輯漏洞)之後,使用者要求繼續用 `codex:codex-rescue` 做更嚴格的第二輪,專門獵「孤兒節點」(掛在系統目錄/UI/config 裡但沒真的接上邏輯的東西)。過程記錄:

- 第一次嘗試完全失敗——沙盒連讀檔案都被拒絕,Codex 誠實回報「發現數0,不代表沒漏洞,是完全讀不到程式碼」,沒有捏造任何發現。
- 重新派工並在提示裡明確要求讀取權限後,第三次嘗試成功完成,交出 6 項發現(3高2中1低)。
- 過程中我自己也用真實登入的瀏覽器 session 動手測試 `/admin/format` 的實際操作,獨立發現「隊伍賽疊加淘汰賽制,配對邏輯不認隊伍」這個問題——跟 Codex 的 Finding 2 完全一致,兩邊獨立驗證交叉確認。

## 已確認的 6 個問題

**Finding 1(高)已產生賽程資料後還能任意切換賽制**:`toggleFormatBlock()` 原本直接對 `round_format_blocks` 表做「先刪同分類舊的、再插入新的」兩次獨立呼叫,完全沒檢查這一輪是否已經有真實 `teams`/`pools`/`matches` 或已確認結果。已產生單敗淘汰場次後切成雙敗淘汰,舊場次沒有 `bracket` 欄位,雙敗淘汰的結算邏輯會判斷成沒人該淘汰——資料被新規則誤判。

**Finding 2(高,我自己瀏覽器實測+Codex 各自獨立確認一致)隊伍賽疊加淘汰賽制,配對邏輯不認隊伍**:UI 允許同時選「隊伍賽」分組跟「單敗淘汰/雙敗淘汰/循環賽」淘汰方式,兩個面板都正常顯示,但這三種淘汰方式的配對邏輯全部直接對 `registrations`(個人報名)配對,完全不知道「隊伍」這個聚合單位存在——組好的隊伍資訊被晾在一邊,純裝飾。

**Finding 3(高)月/週期累積制允許各輪覆寫評分規則,會讓自動淘汰跟外卡候選排序算錯**:`mergeJudgeScoringData()`(`lib/judgeScoring.ts`)拿賽段第一輪的 `scoreItems` 當整個賽段的欄位定義去合併加總,UI 卻允許賽段內任一輪獨立開啟評分規則覆寫——一旦某輪的計分項目 id 不同,那一輪的分數在合併時會直接對不上欄位、被靜默漏算,不只是顯示錯誤,直接影響自動淘汰跟外卡候選排序算出錯的人。程式本身已經有註解點出這個假設,但從來沒有資料庫或 UI 層的實際約束。

**Finding 4(中)循環賽沒選抽籤分組會靜默產生 0 場次**:`generate_round_robin_matches_for_round()` 只檢查本輪有沒有 `round_robin` block,但配對邏輯完全依賴 `pools` 表——`pools` 只有掛了 `lottery` block 才會建立。選了循環賽不選抽籤分組,配對函式成功執行但一場都不會產生,沒有任何錯誤訊息。

**Finding 5(中,我獨立驗證確認)「敗部復活戰」勾選框是孤兒標籤**:真正驅動外卡復活的 `WildcardRevivalPanel` 是競賽層級元件,完全不看任何 round 的 `special` 值;`open_wildcard_revival_event()` 的資料庫驗證也完全不查 `round_format_blocks`/`format_blocks`。勾選任一輪的「敗部復活戰」不會啟用任何功能,不勾選仍可正常開外卡投票——比業界導師制那種純標籤更容易誤導主辦人,因為它「看起來」像是接上了。

**Finding 6(低)`MatchRow.pool_id` 型別跟實際 schema 不一致**:單敗淘汰批次已經把 `matches.pool_id` 改成可為 null,`page.tsx` 的 `MatchRow` 型別卻宣告成 `string`,靠 `as unknown as MatchRow[]` 不安全 cast 掩蓋。

Codex 也交叉比對過所有 `grant execute ... to authenticated` 的 RPC 跟 `web/src/**` 的 `.rpc()` 呼叫,確認沒有真的孤兒 RPC——表面上沒被 web 直接呼叫的幾支產生器(`form_team_groups_for_round`、`form_lottery_pools_for_round` 等)都是被 `check_and_form_pending_*` wrapper 在資料庫內 `perform` 呼叫,不是孤兒。

## 修復

新增 `set_round_format_block(p_round_id, p_category, p_block_key)` security definer RPC,取代 `toggleFormatBlock()` 對 `round_format_blocks` 的直接 table 操作(僅限 elimination/grouping 兩個分類;special 分類維持原本的 toggle 開關邏輯,因為那些不影響賽程資料完整性)。單一交易內依序驗證:

1. 這一輪是否已有真實 `teams`/`pools`/`matches` 或 `results_finalized_at` 非空——有就整個拒絕(Finding 1)。
2. 隊伍賽跟 `single_elimination`/`double_elimination`/`round_robin` 互斥,雙向擋(Finding 2)——`periodic_accumulation` 不是對戰配對賽制,不受這條限制,隊伍賽疊加它正常允許。
3. `round_robin` 需要 grouping 已經是 `lottery`,反過來 grouping 想切離 `lottery` 時如果 elimination 還是 `round_robin` 也擋下(Finding 4)——只要「先選抽籤分組、再選循環賽」這個順序永遠走得通,不會讓使用者被雙向規則卡死。
4. 切成 `periodic_accumulation` 時,這一輪不能已經有獨立評分規則覆寫(Finding 3 的其中一個方向)。

另外在 `scoring_rules` 表加一個 `BEFORE INSERT` trigger:這一輪如果已經掛了 `periodic_accumulation` block,拒絕建立獨立評分規則覆寫(Finding 3 的另一個方向)——兩個方向合起來完全鎖死這個組合,不管使用者從哪個操作順序切入都會被擋。

`format_blocks` 目錄移除 `wildcard_revival` 這筆(Finding 5,做法比照業界導師制:防禦性清掉可能存在的 `round_format_blocks` 掛載後刪目錄列,前端目錄動態查表不需要程式碼異動)。`MatchRow.pool_id` 型別修正為 `string | null`(Finding 6)。

`toggleFormatBlock()`/`toggleScoringOverride()` 的錯誤訊息都補上對應這些新驗證失敗情境的友善文案。

## 未涵蓋(刻意延後)

Finding 2 只做了「禁止不相容組合」的防呆,沒有做「真正支援隊伍為對戰單位」的完整功能(新增對戰參與者模型、投票/勝負/淘汰/排名/外卡候選計算全部改成以隊伍為單位)——這是一個獨立、規模不小的功能,不在這次修復範圍內,之後有需求再另外設計。

## 驗證

真實 PoC(對正式 Supabase 環境,一次性測試帳號/比賽,`finally` 區塊清乾淨):14 個情境涵蓋 5 個發現的正向拒絕、反向拒絕、以及對照組(確認沒有誤傷正常路徑),14/14 通過。`security-regression.mjs` 新增 9 項永久回歸檢查,合計 98/98 全部通過。`tsc`/`eslint`/`build` 全程乾淨。

**尚未驗證**:這批修復的 UI 層面(`toggleFormatBlock`/`toggleScoringOverride` 觸發新驗證失敗時,`/admin/format` 頁面的錯誤訊息實際顯示效果)沒有經過瀏覽器肉眼驗證,跟之前所有批次同一個缺口。
