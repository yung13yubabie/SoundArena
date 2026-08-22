# ADR-0021：評審評「AI 使用方式」/ 觀眾投票評「整體吸引力」的雙軌評分機制

使用者這輪明確要求把 SoundArena 的評分機制重新定位:評審跟觀眾投票是兩套完全不同的評分邏輯,不能混在一起看——評審只評「AI 的使用方式」(技術新意、歌曲工藝紮實度、人本創作過程、倫理數據來源、過程透明度),觀眾投票評「整體吸引力」(好不好聽,不用懂技術)。作品要同時打動懂 AI 音樂技術的評審,也要讓一般聽眾覺得好聽。

這是有規模的新功能,照專案 CLAUDE.md 的規則("有規模的新功能從 `/speckit.specify` 開始")應該先定案 WHAT/WHY 再動手——但 `/speckit.specify` 這個 skill 在目前環境沒有裝上,改用同樣的紀律手動處理:先用 `AskUserQuestion` 問清楚幾個只有使用者能決定的關鍵點,再寫規格、再實作。

## 決策記錄(使用者這輪明確選擇,不是自行假設)

1. **評審分數跟觀眾投票分數怎麼合併成最終排名**:仍然走現有的加權總分模式(scoring_rules/score_items)。沒有拆成兩個獨立排名——主辦人自己決定評審項目跟投票項目的權重比例,這件事沿用既有架構,不新增合併邏輯。
2. **Process Doc(逐工具逐 prompt 交代創作過程)怎麼提交**:自由長文字欄位,不做結構化表單(不是每工具一個重複區塊)。
3. **「倫理數據來源/公平訓練工具」這個目前完全沒有系統基礎的概念,MVP 怎麼做**:自申制標籤——投稿時勾選聲明,平台不驗證任何工具白名單,完全靠評審自行判斷可信度。
4. **這套新評分模式的適用範圍**:只當作新的 score_item_templates 選項,不取代/不遷移既有比賽的計分規則——主辦人建立新比賽時自己選要不要用。

## 資料模型變更

`supabase/migrations/20260822040000_ai_judging_criteria.sql`:

- `submissions` 新增 `process_doc text`(選填,上限 20000 字,DB check constraint + RPC 內雙重驗證)跟 `ethical_sourcing_declared boolean not null default false`。
- `score_item_templates` 新增 5 筆:`ai_technical_novelty`(AI 技術新意)、`craftsmanship`(歌曲工藝)、`human_process`(人本創作過程)、`ethical_sourcing`(倫理數據來源)、`process_transparency`(過程透明度),全部是 `weighted` kind。現有的模板選擇 UI(`AdminFormatClient.tsx` 的「+ 加分項」picker)本來就是動態讀 `score_item_templates` 表渲染,不用改任何前端程式碼就能選到這 5 個新模板。
- `submit_entry()` 加兩個新參數(`p_process_doc`/`p_ethical_sourcing_declared`)。因為簽章變了,依 ADR-0018/0020 學到的教訓,先明確 `drop function` 舊的 9 參數版本,不能只靠加預設值蒙混過去,否則會產生重載讓 PostgREST 判斷不出該呼叫哪一個。
- `judge_submissions_for_round()`(ADR-0020 新增的匿名安全 RPC)延伸回傳 `process_doc`/`ethical_sourcing_declared`——評審沒有這兩個欄位就沒有任何依據可以評「人本過程」「倫理來源」「過程透明度」這三項,而且這兩個都不是身份欄位,加進去沒有違反 ADR-0020 建立的匿名邊界。**這裡踩到一個新的 Postgres 限制,跟 ADR-0018/0020 的「重載」問題不同**:`RETURNS TABLE` 的輸出欄位改變時,`create or replace function` 會直接報「無法改變既有函式的回傳型別」,跟改參數列表不是同一條規則——參數列表不變、只加輸出欄位一樣要先 `drop function` 再重建,不能靠 replace。

## 應用層變更

- `web/src/app/submit/SubmitForm.tsx` / `submit/actions.ts`:投稿表單在歌詞欄位之後新增「創作過程說明(Process Doc,選填)」長文字欄位跟「我聲明本作品主要使用的 AI 工具標榜公平訓練、尊重版權」勾選框,`SubmitEntryInput` 介面同步加兩個欄位。
- `web/src/app/judge/JudgeBoard.tsx`:每個作品卡片新增「展開創作過程說明」按鈕(預設收起,避免長文字把評分表擠出視窗)跟倫理聲明徽章,評審打分前可以參考。
- `web/src/app/judge/page.tsx`:改用延伸後的 `judge_submissions_for_round()` RPC 回傳資料。

## 真實 PoC(6/6 通過)

一次性測試帳號(organizer / judge-only collaborator / participant)+ 真實 session,驗證:5 個新模板存在且是 weighted、主辦人能用 `add_score_item_from_template()` 把新模板加進評分規則、`submit_entry()` 正確存入 process_doc/倫理標籤(獨立用 service_role 複查落地)、process_doc 超過 20000 字被 DB 拒絕、`judge_submissions_for_round()` 正確回傳新欄位且仍完全不含任何身份欄位。

**過程中一次真的卡關,但確認是既有邏輯、不是這次新功能的 bug**:第一版 PoC 對一個全新的空 `scoring_rule` 直接呼叫 `add_score_item_from_template()` 失敗,錯誤訊息是「weighted score_items must sum to 100%(got 0.00)」。追查後發現這是 `20260816010347_init_schema.sql` 從第一天就有的 `deferred initially deferred` constraint trigger(SPEC.md 第8節的硬規則)——真實 `createCompetition()` 流程一開始就會種三個預設項目湊滿 100%(投票40+影片流量25+外部投票35),之後加自訂項目時新項目的 weight 是 0,不會破壞總和(100+0=100)。PoC 補上跟真實流程一致的 baseline 種子資料後,重跑通過。

`tsc`/`eslint`/`build` 全程乾淨(eslint 剩 2 個跟本次改動無關的既有警告)。
