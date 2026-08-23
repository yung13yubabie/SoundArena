# ADR-0044:組隊賽亂數分組(團隊分組小地基)

賽制細節填空的第一塊小地基。查證發現一個影響範圍很大的事實:`format_blocks` 目前純粹是標籤,淘汰全部靠主辦人手動點,選哪個賽制積木完全不影響任何實際行為。這代表「組隊賽」要能真的運作,得從零建立自動分組機制,不是加個小開關。動手前經過多輪 grilling 確認設計,再實作。

## 設計(逐項對應 grilling 確認的決定)

**觸發時機**:第一輪(初選)是「報名截止」;非第一輪是「前一輪的確認結果動作」——**不是** `voting_closes_at`。使用者明確糾正:投票截止到主辦人實際確認淘汰名單之間有空窗期,用投票截止當訊號會把即將被淘汰、但還沒真的被標記的人也分進下一輪隊伍。為此新增獨立的 `results_finalized_at` 欄位 + `finalize_round_results()` RPC,主辦人在 `/judge` 頁面看過淘汰標記無誤後手動按「確認本輪結果」,這個時間點才是分組真正等待的訊號。

**分組範圍**:隊伍綁在「輪次」上,不是整場比賽——同一個人在不同的團隊輪次可能被分到不同隊伍,每次都是獨立、重新分組。

**分組方式**:目前唯一實作的分組機制是亂數(`order by random()`),每隊人數存在該輪 `team` 積木的 `round_format_blocks.config->>'team_size'`(沿用 `themed_round` 已經在用的同一種 jsonb 存法),沒填預設 3 人。人數除不盡時最後一隊人數較少。

**沒有天然使用者動作可以掛**:「報名截止」「前一輪確認結果」都是時間點/狀態變化,不是誰按了一個按鈕。整個機制設計成「造訪相關頁面時順便檢查」的 lazy check(`check_and_form_pending_teams(competition_id)`),完全冪等、自我驗證條件、不需要呼叫端有特殊權限——掛在 `/status`(參賽者)、`/admin/format`(主辦人)頁面載入,以及 `finalize_round_results()` 成功後(最接近真正觸發時機的一次立即嘗試),三層疊加,兜底才是 Vercel Hobby 方案的每日 cron。

**通知**:分組完成後對每個被分組的參賽者建立 `team_assigned` 通知事件(擴充 `notification_events` 的 event_type CHECK 清單),內容列出隊名跟隊友名字——不透過 `create_notification_event()`(那支 RPC 假設呼叫者是本人或有 review 權限,但這裡的呼叫者可能只是剛好造訪頁面、順便觸發檢查的任何人,跟被通知對象無關),直接 insert。建立後透過新增的 `dispatchPendingTeamNotifications()` 立即嘗試送出(掃這場比賽所有還沒送出的 `team_assigned` 事件,不只當下訪客自己的),失敗留給每日 cron 兜底,跟 SA-005/SA-012 同一套模式。

**後台換組**:`swap_team_member(registration_id, new_team_id)` RPC——校驗目標隊伍屬於同一輪次、呼叫者對這場比賽有 `review` 權限,換組後對移動的參賽者重新發一則 `team_assigned` 通知。UI 在 `/admin/format` 的「分組方式」選了「隊伍賽」時,顯示每隊人數設定 + 目前分組名單,每個成員旁邊一個下拉選單可以直接換組。

## 修正一次真正的設計錯誤(部署後才發現)

第一版 migration 的判斷式要求一輪同時掛 `team` **和** `lottery` 兩個積木才觸發分組。部署後對照 `AdminFormatClient.tsx` 才發現:`grouping` 這個 category 在真實 UI 底下是單選(`toggleFormatBlock()` 選了新的就把同 category 的舊積木刪掉),`team`/`lottery`/`individual` 三者互斥,不可能同時存在。照原判斷式,`form_team_groups_for_round()` 在真實 UI 底下永遠不會觸發,整個功能會是死碼。

修正:判斷式改成只檢查 `team` 積木存在(隊伍賽本身就代表需要分組,亂數是目前唯一實作的機制)。`lottery` 積木留給未來「個人賽但用抽籤分場次/種子」這種獨立玩法,跟隊伍分組無關。這是繼續往下蓋 UI 之前,對照真實使用路徑抓到的 bug,不是憑空猜的——`security-regression.mjs` 新增的檢查用的正是「只掛 team,不掛 lottery」這個真實情境。

## 驗證

真實 PoC(對正式 Supabase 環境):5 人/每隊 2 人分成 3 隊、報名者無重複無遺漏、重複呼叫冪等、Discord 登入者收到 `team_assigned` 事件且 channel 正確、訊息真的送達 Discord(使用者確認收到)、主辦人可以換組且結果正確反映。發現觸發條件設計錯誤後,額外一輪 PoC 驗證修正後只掛 `team` 積木也能正確觸發。`security-regression.mjs` 新增 8 項長期守護(分組觸發、冪等、確認結果的時間/權限閘、換組的權限/同輪次檢查),44/44 通過。`tsc`/`eslint`/`build` 全程乾淨。

**尚未驗證**:新增的三個 UI 介面(`/judge` 的「確認本輪結果」按鈕、`/admin/format` 的每隊人數設定與分組名單換組面板)未經瀏覽器肉眼驗證——沒有既有登入 session,OAuth 登入需要使用者本人操作,無法在這次工作中代為完成。SQL/RPC 層的正確性已用上述真實 PoC 涵蓋,但畫面實際呈現(排版、互動狀態)還沒看過。

**保留的軟性假設**:`team_size` 未設定時預設 3 人,是我單方面提出、使用者未逐字確認的預設值,實際使用時可能需要調整。

## 未涵蓋(刻意延後)

團隊「單一合作作品」的投稿流程(UI/邏輯讓隊伍共用一筆投稿,而非每人各自投稿)——這批只做到分組本身,投稿整合是下一批的工作。
