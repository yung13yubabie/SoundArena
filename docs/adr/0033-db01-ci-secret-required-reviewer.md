# ADR-0033:DB-01——security-regression CI 改走需要人工審核的 GitHub Environment

第二輪第三方稽核報告的第三個 P1。指出 `security-regression` 這個 CI step 跟 build 同一個 job、每次 push/PR 自動執行,而它真的握有正式環境的 `SUPABASE_SERVICE_ROLE_KEY`(bypass RLS 的信任等級)——如果哪個 npm 依賴被植入惡意 postinstall script,CI 就會自動、無人值守地暴露這把 key。

## 先釐清真實風險範圍,不照單全收報告的措辭

報告的 Failure Scenario 提到「fork PR」跟「同 repo branch」兩種情境。查證後:

- 這個 repo 是**公開**的,但**只有一位維護者**,沒有其他協作者。
- GitHub 對 fork PR 有平台原生保護:`pull_request`(不是 `pull_request_target`)觸發的 workflow,如果 PR 來自外部 fork,repository secrets 預設不會被帶進去——這是 GitHub 內建行為,不是這個專案自己設定的。

所以報告裡「陌生人開惡意 PR 偷 secret」這個情境,在這個 repo 現況下**不成立**(沒有外部協作者能開啟會拿到 secret 的 PR)。真正殘留的風險是**供應鏈型**的:`package.json` 的某個依賴被植入惡意程式碼(例如 postinstall script),在維護者自己的 push 觸發 CI 時偷跑,這個風險是通用的、跟「誰能開 PR」無關,對任何握有 secret 的 CI 都成立,不是這個專案特有的設計缺陷。

## 決策:零成本緩解,不建新的 staging 基礎設施

報告建議的完整修法是切出獨立的 staging Supabase + B2 環境——這需要新建 Supabase 專案、新 B2 bucket、重新 replay 所有 migration,是真正的新基礎設施投資。跟使用者確認後,選擇**零成本緩解**:利用公開 repo 可以免費使用的 GitHub Environment 保護規則(private repo 這個功能要 Pro/Team/Enterprise 方案才有,public repo 不限方案都能用)。

## 修法

1. `gh api -X PUT repos/.../environments/ci-security-test` 建立新的 GitHub Environment,設定 `required_reviewers` 保護規則(reviewer 是 repo owner 本人)。
2. 把三個憑證(`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`)從 repo-level secrets 移到這個 environment 專屬的 secrets(`gh secret set ... --env ci-security-test`),然後刪除 repo-level 的副本——`build` job(沒有綁定這個 environment)完全碰不到這三個值。
3. `.github/workflows/ci.yml` 拆成兩個 job:`build`(維持原樣,eslint+build,無需 secrets,每次 push/PR 自動跑,不受影響)、`security-test`(`needs: build`,`environment: ci-security-test`,只做 `npm run test:security`)——`security-test` 這個 job 每次觸發都會停在「等待審核」狀態,要在 GitHub Actions 頁面手動點核准才會真的執行、真的碰到 service_role。

沒有把 `security-test` 加進 branch protection 的 required status checks——這個專案一路維持「不強制 PR review、直接 push+deploy」的快速迭代工作流程(見 ADR-0016),把它設成必要檢查會讓每次 push 都被這道審核閘擋住合併/部署,超出「增加供應鏈攻擊防護」這個目的本身需要的範圍。

## 驗證

先推送一次真實 commit,確認 `security-test` job 真的停在「Waiting」/等待審核狀態,不是自動執行;手動核准後確認它正常執行、正確讀到 environment secrets、`npm run test:security` 20/20 通過。`build` job 不受影響,一樣自動跑完 eslint+build。
