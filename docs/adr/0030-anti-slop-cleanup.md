# ADR-0030:Anti-Slop 清理——原始稽核報告除了 SA-0XX 之外的三個具體項目

Stop hook 持續認為「三項暫緩」不等於「審計報告完成」。重新翻閱原始稽核報告全文後,發現先前只聚焦在 SA-001~SA-013 這些編號 finding,漏看了報告裡「Anti-Slop Report」跟「Prioritized Remediation Roadmap」P3/P4 段落的具體項目——這些不需要任何憑證、也不是需要使用者做風險決定的動作,是真正還沒做、而且能自主完成的部分。這輪處理其中三項。

## `mockData.ts` 改名

原始報告的 Anti-Slop 表格:「`web/src/lib/mockData.ts`:現在只剩 state metadata,不是真 mock data。新人會誤判 production 還依賴 mocks。Rename」。

確認內容後屬實——這個檔案只有 `SUBMISSION_STATE_META`(投稿狀態的顯示文字 + CSS class 對照表)跟 `STATE_PILL_CLASS`,是純粹的 UI 顯示元資料,跟「假資料」完全無關,檔名卻叫 `mockData.ts`。改名為 `submissionStateMeta.ts`,更新三個呼叫點(`status/page.tsx`、`status/StatusSubmissionsList.tsx`、`admin/review/ReviewQueue.tsx`)的 import。

## Closed Competition 卡片仍顯示「查看並報名」CTA

原始報告 UX 稽核:「即使 Competition 已顯示『報名已截止』,卡片仍然保留『查看並報名 →』...這與 backend deadline Finding 疊加,會形成:Visual state 與 action affordance 不一致。」

確認 `DiscoveryList.tsx` 的狀態徽章(`STATUS_META`)已經正確依 `registration_closes_at` 顯示「報名已截止」,但下方的 CTA 連結文字不管狀態一律寫死「查看並報名 →」。修法:CTA 文字依 `status` 條件顯示,`open` 才顯示「查看並報名 →」,`closed`/`pending` 顯示「查看比賽 →」,連結目的地不變(`/register?competition=X` 本來就會正確顯示報名已截止的說明,見 `RegisterForm.tsx` 的 `registrationClosed` 分支,這裡只是修文字承諾跟實際狀態不一致的問題)。

## 清除 vestigial 的 `competitions.anonymity_mode`

原始報告 Anti-Slop 表格:「`competitions.anonymity_mode` vs `rounds.is_anonymous`:Migration 已自己標註舊 Competition 欄位為 vestigial。同一 domain concept 有兩套模型。Merge / retire legacy」。

這個欄位早在 ADR-0006(`20260817020000_per_round_anonymity.sql`)就被自己的 migration comment 註記為「不再被任何邏輯讀取」,但欄位本身留到現在沒有真的清掉。這輪確認清除是安全的:

1. `grep -rn anonymity_mode web/src` 全專案零引用(app 層完全沒有任何程式碼讀寫這個欄位)。
2. 目前**生效**的 `round_identity_revealed()`(ADR-0006 建立的版本)、`get_round_submissions()`/`get_round_scores()`(ADR-0004 的 `comment_endorsement` migration 建立的版本)都已改用 `rounds.is_anonymous`,不讀 `competitions.anonymity_mode`——舊 migration 檔案裡看到的 `v_anonymity anonymity_mode` 只是被後續 `create or replace` 取代掉的歷史版本,不是現行邏輯,單純 grep migration 檔案會被誤導。
3. `competitions` 的 UPDATE 權限早在 ADR-0011(資安複查)就整個從 `authenticated` 收回,改走 `save_competition_schedule()`/`update_competition_name()`/`create_competition_full()` 等專用 RPC——這個欄位連寫入路徑都不存在,不只是「沒人讀」,是「沒人能寫」。

`alter table competitions drop column anonymity_mode; drop type anonymity_mode;`

## 驗證

`tsc`/`eslint`/`build` 全程乾淨。欄位刪除是結構性改動,額外做了兩層驗證:重跑 ADR-0027 的完整安全回歸測試(`npm run test:security`,15/15 通過,涵蓋建立比賽等會碰到 `competitions` 表的路徑),另外針對 `create_competition_full()` RPC 專門寫了真實 PoC(用真實帳號呼叫,確認比賽+2 輪次正確建立、`is_anonymous` 正確套用),2/2 通過。

`tsc`/`eslint`/`build` 全程乾淨,已 commit、push、`vercel --prod` 上線。
