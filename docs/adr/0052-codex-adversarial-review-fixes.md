# ADR-0052:Codex 對抗式審查(codex:codex-rescue)修復

使用者要求對「賽制細節填空」整批新功能(循環賽/單敗淘汰/雙敗淘汰/外卡復活)做對抗式測試,委派給 `codex:codex-rescue`。Codex 實際跑在受限的沙盒環境(無法寫檔、shell 被拒絕、瀏覽器啟動失敗),**沒有做到真正的瀏覽器 E2E 測試**,只完成一次純靜態程式碼審查,回報 4 項發現(3高1中)。這份 ADR 記錄逐項對照原始碼、並用真實資料庫(含真實 anon-key 登入的 session client)驗證後確認為真、以及修復的內容。

## Codex 的環境限制(誠實記錄,不是修復內容)

- Shell 執行被政策拒絕,連唯讀指令都不行。
- 工作目錄是唯讀的,沒辦法寫檔或跑 migration。
- 要求的真實瀏覽器測試在導覽前就因為 `Cannot redefine property: process` 而啟動失敗——這是執行環境本身的問題,不是應用程式的結果。
- 因此 Codex 完全沒有建立/清理任何測試資料,也沒有真的驗證過任何一項發現,4 項都是純推理。**逐項獨立驗證是這份 ADR 做的事,不是 Codex 做的。**

## 已確認的 4 個問題

**Finding 1(高)match_votes 沒有投票視窗檢查**:`check_match_vote_validity()` 只檢查場次存在、選的人在場次裡、不是投自己——對照舊的 `votes` 表驗證 trigger(有檢查審核狀態、報名狀態、`voting_opens_at`/`voting_closes_at`),`match_votes` 從循環賽批次(ADR-0048)建立以來就完全沒有視窗檢查。影響循環賽/單敗淘汰/雙敗淘汰三種賽制的配對投票,任何時間都能投,不受投票視窗約束。用真實資料庫重現:視窗開放前/截止後插入 `match_votes` 都成功,修復後都正確被拒絕。

**Finding 2(高,但是既有投票機制原本就有的根本缺口)一般投票者讀不到對手的投稿內容**:投稿表單 `allowPublicPlayback` 預設 `false`,`submissions` 表的 RLS 只放行「投稿者自己/主辦人/`allow_public_playback=true`」三種身份——一般投票者(不是這三種)完全讀不到別人的投稿。用真實 anon-key 登入的 session client(不是 service_role)實測確認:預設設定下投票者讀到 0 筆。**這不是這批新功能引入的**,`/vote` 原本的單選投票頁面用的是同一套讀取邏輯,只是這批新增了更多依賴同一套假設的畫面(配對投票、外卡復活投票),讓缺口更明顯。目前正式環境還沒有真實投稿(查證過,0筆),所以還沒有真實使用者受影響。

**Finding 3(高)resolve_wildcard_revival_event() 不驗票**:這支 RPC 原本只驗證權限/時程/候選人資格,沒有驗證傳進來的贏家是不是真的得票最高——主辦人技術上可以指定任何候選人復活,直接違背 grilling 當初選定的「開放觀眾投票決定,不是主辦人手動指定」(見 ADR-0051)。用真實資料庫重現:2票的候選人輸給指定的0票候選人,原本的 RPC 完全不擋。

**Finding 4(中)雙敗淘汰敗場數算錯範圍**:`generate_double_elimination_matches_for_round()` 的敗場數查詢只用 `competition_id` 篩選對戰紀錄,沒有限定只算掛 `double_elimination` 積木的輪次——如果同一場比賽前面輪次是循環賽或單敗淘汰,後面才切雙敗淘汰,前面輪次的輸贏會被誤算進雙敗淘汰的敗場數。這是真實會發生的組合(每輪各自選賽制本來就是這個系統的設計),不是純理論邊界。用真實資料庫重現:循環賽輪次一場輸贏,誤導致雙敗淘汰第一輪把其中一人算成1敗。

## 修復

- Finding 1:`check_match_vote_validity()` 補上比照 `votes` 表同一套的 `voting_opens_at`/`voting_closes_at` 檢查(join `matches → rounds`)。
- Finding 2:新增 `get_votable_submissions(p_round_id)` security definer RPC,只在「比賽公開 + 這輪投票視窗開放中」才回傳投票必要的安全欄位(不含審核狀態等內部欄位)。**刻意不擴大 `submissions` 本身的 table RLS**,避免連 `suno_share_url` 這類可能洩漏身份的欄位被放寬。`/vote`(一般投票+配對投票兩個分支)改用這支 RPC 讀。外卡復活投票另外需要一支 `get_wildcard_revival_candidates(p_event_id)`——不能直接沿用 `get_votable_submissions()`,因為那支綁的是「來源輪次自己的投票視窗」,但外卡復活投票開放時來源輪次的投票早就截止了,綁錯視窗會整個回傳空集合。
- Finding 3:`resolve_wildcard_revival_event()` 改成自己算票數(得票最高的候選人),跟呼叫端傳的贏家不一致就拒絕,平手也拒絕。第一版寫的時候把 `max`/`top_count`/`winner` 用同一個 CTE 拆成兩個獨立陳述式,PL/pgSQL 裡 CTE 作用域只限當下那一個陳述式,PoC 直接跑出 `relation vote_counts does not exist`——這是自己寫修復時犯的新 SQL bug,另開一個 migration(20260828030000)改成全部收進同一個陳述式一次算完,修好後重跑 PoC 才過。
- Finding 4:敗場數查詢補上 `exists (... round_format_blocks/format_blocks ... fb.key = 'double_elimination')` 過濾,只算真的掛雙敗淘汰積木的輪次。

## 驗證

真實 PoC(對正式 Supabase 環境,全程用一次性測試帳號/比賽,`finally` 區塊清乾淨):4 個 Finding 各自的「修復前重現問題、修復後不再發生」加對照組(確認沒有誤傷正常路徑),9/9 通過。過程中兩次因為 PoC 腳本自己的設定錯誤(呼叫權限閘 RPC 用了 service_role 而不是簽名登入的 organizer client、投票視窗設定順序搞反)得到誤導性的失敗訊息,逐一排查後確認是腳本問題不是修復問題,修正腳本後才是最終的 9/9。

`security-regression.mjs` 新增 9 項永久回歸檢查。過程中發現既有的循環賽測試段落(ADR-0048)本身的 fixture 有問題——`voting_closes_at` 從建立時就設在過去,先前因為沒有視窗檢查所以沒暴露,Finding 1 修復後配對投票的正常/異常測試全部被新的視窗檢查擋下,連帶讓「不能投自己參與的場次」「選擇的對象不在這場配對裡」兩項測試失敗。修正 fixture(投票測完才把視窗關掉,確認結果前才需要視窗已截止)後,`tsc`/`eslint`/`build`/`security-regression.mjs` 全部 89/89 通過。

## 未涵蓋(刻意延後)

Codex 要求的真實瀏覽器 E2E 測試完全沒有跑成——這批修復的所有 UI 層面(尤其 `/vote`、`/vote/wildcard` 改用新 RPC 之後的實際渲染)一樣沒有經過瀏覽器肉眼驗證,跟 ADR-0044 到 ADR-0051 累積下來的同一個缺口一樣。
