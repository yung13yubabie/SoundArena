# ADR-0027:SA-004 CI 安全回歸測試

按 `/goal` 繼續處理審計報告最後一個大項目——SA-004(CI 缺乏 RLS/多租戶安全回歸測試)。報告原文的建議是完整的 Role × Resource × Action 測試矩陣;考量規模,這輪把這個 session 手動 PoC 過的核心邊界收斂成一支可重複執行的腳本,不追求窮盡每一種角色/資源/動作組合。

## 決策記錄:先寫腳本、驗證能跑,再問使用者要不要接 CI

寫測試腳本本身(建立/清理測試資料、呼叫 RLS/RPC、驗證結果)是安全、可逆的動作,直接做。但「把腳本接進 CI」牽涉兩件 CLAUDE.md 明確列為需要確認的事:新增正式環境的 `SUPABASE_SERVICE_ROLE_KEY` 等憑證到 GitHub Actions secrets,以及修改 `.github/workflows/ci.yml` 本身(「修改 CI/CD 流程」在 CLAUDE.md 的 hard-to-reverse 清單裡明確點名)。即使 `/goal` 授權持續處理稽核項目而不用每項先問範圍,這類風險動作仍先停下來問使用者——這不是重新討論「要不要做 SA-004」,而是「要不要讓正式環境憑證進 CI、每次 push 自動打正式站」這個更具體的風險決定。使用者確認後才接。

## 腳本設計

`web/scripts/security-regression.mjs`(ESM,因為 `require()` 在這個專案的 eslint 設定下被 `@typescript-eslint/no-require-imports` 擋——第一版寫成 CommonJS `.js` 被 eslint 擋下 3 個 error,依照 config-protection hook 的指示「修程式碼滿足規則,不要弱化設定」,改寫成 ESM 而不是加 eslint override)。

不把任何金鑰寫死進檔案——讀環境變數(`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`),本機沒有另外 export 時自動從 `web/.env.local` 讀(`.env.local` 本身不進版控),CI 環境從 GitHub Actions secrets 注入。用一次性測試帳號(`auth.admin.createUser`)+ 真實 RLS/RPC 呼叫,不用 service_role 偽造結果,結束後無論成功失敗都清理全部測試資料(competitions cascade 掉 rounds/registrations/submissions,再刪測試帳號)。

涵蓋的檢查(15 項,對應這個 session 處理過的多個 finding):

- 跨租戶隔離:Organizer B 不能改 Organizer A 的比賽,獨立複查名稱真的沒被改掉;Organizer A 自己可以正常改(回歸)。
- Judge 匿名邊界(ADR-0020):judge-only 協作者直接查 `registrations` 拿不到任何列,`judge_submissions_for_round()` 正常運作且不含身份欄位。
- 權限子集:review-only 協作者能看身份(合法用途)但不能打分,judge-only 協作者可以正常打分(回歸)。
- SA-007(ADR-0024):跨 scoring_rule 的 score_item 被拒絕。
- SA-002(ADR-0020):報名/投稿截止時間收進 DB 層,截止後的寫入被拒絕。
- Vote 有效性:不能投自己、同一人同一輪不能投兩次(回歸:正常投票成功)。
- GRANT 收回:繞過 `save_submission_score()` RPC 直接寫 `submission_scores` 被拒絕。

`npm run test:security` 是這支腳本的執行入口。

## CI 整合

新增 GitHub Actions secrets(`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`,透過 `gh secret set` 用 stdin 輸入,不留在 shell 歷史紀錄裡),`.github/workflows/ci.yml` 在 `npm run build` 之後新增一個 step 執行 `npm run test:security`,失敗會讓整個 CI job 失敗、擋下 merge/deploy 的信心指標(這個專案沒有強制 PR review,CI 綠燈是主要的品質關卡)。

## 這輪沒做的部分

不是窮盡所有角色 × 資源 × 動作組合(報告原文建議的完整矩陣規模远大於這 15 項),只覆蓋這個 session 實際踩過、修過的邊界。之後每次修權限相關的 RLS/RPC,應該把新的邊界也加進這支腳本,讓它持續累積,而不是一次寫完就不再更新。

## 驗證

本機 `npm run test:security` 15/15 通過。`tsc`/`eslint`/`build` 全程乾淨(eslint 一開始因為 CommonJS `require()` 噴 3 個 error,改寫成 ESM 後恢復乾淨,只剩 2 個跟本次改動無關的既有警告)。推送後在 CI 上實際跑過新的 `npm run test:security` step,確認 15/15 通過、綠燈。
