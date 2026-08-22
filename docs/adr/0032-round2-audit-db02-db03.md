# ADR-0032:第二輪第三方稽核複查——DB-02(submit_entry 繞過驗證層)、DB-03(Collaborator 被審核閘卡死)

使用者丟了第二輪第三方 AI 稽核報告(這輪整體分數 57→64,確認上一輪核心問題已收斂),點名三個新 P1,要求先處理 DB-02/DB-03(DB-01 涉及新增正式環境基礎設施決策,留給使用者判斷,見下)。一樣照 `systematic-debugging` 紀律先驗證再動手。

## DB-03:Collaborator/Judge 被 Organizer 審核閘卡死

**驗證**:讀 `judge/page.tsx`、`admin/review/page.tsx`、`admin/format/page.tsx`、`admin/schedule/page.tsx`、`admin/collaborators/page.tsx` 五個頁面,確認全部有同一個 pattern:host 審核閘(`host_setup_completed`/`host_approved_at`/`host_revoked_at`)寫在 `getManageableCompetitions()` 查詢**之前**——一個從未申請成為 Organizer、但被邀請當某場比賽 judge 協作者的合法使用者,會在真正查到自己有沒有協作權限之前就被導去 `/admin/profile`。確認為真。

**修法**:五個頁面統一改成先呼叫 `getManageableCompetitions()`,只有在**真的一場都管不到**(`myCompetitions.length === 0`)且非 PlatformAdmin 時,才導去 `/admin/profile`。「能不能建立自己的比賽」(host 審核)跟「能不能管理別人邀請我的比賽」(collaborator 權限)現在是兩個獨立判斷維度,不共用同一道閘——`/admin/format` 在完全沒有可管理比賽時仍會落入 `CreateCompetitionForm`,「建立新比賽」本身還是要卡 host 審核,這條規則沒變。

**真實 PoC**:確認 judge-only 測試帳號(`host_approved_at IS NULL`,從未申請 Organizer)呼叫 `get_manageable_competitions('judge')` 正確拿到被邀請的比賽,呼叫 `get_manageable_competitions('review')`(沒有這個權限)正確拿到空清單——證明頁面邏輯依賴的資料本身正確,五個頁面的條件判斷都是同一份邏輯,已用 tsc 確認正確套用。

## DB-02:submit_entry() 可繞過 Next.js Server Action 的外部驗證層

**驗證**:`submit_entry()` 從 `20260820030000_submissions_secure_rpc.sql` 就 `grant execute ... to authenticated`,而 Server Action(`submitEntry()`)在呼叫這支 RPC 之前做了兩層 DB 驗證不到的外部檢查——重打 Suno API 確認分享連結真的屬於這個帳號、Range GET 音檔開頭 bytes 驗證 magic bytes。這兩層檢查只在 Server Action 裡,RPC 本身只做字串/格式比對。**這個 session 稍早的 PoC(`poc_sa001_sa002.js`)剛好就是用 authenticated client 直接呼叫 `submit_entry()` 成功過**——當時是為了測 SA-002 的截止時間檢查,沒特別注意到這件事本身就是 DB-02 的具體證據。確認為真。

**修法**:沿用這個 session 已經用過的手法(registrations/votes/submission_scores/一輪前的 submission_scores)——`submit_entry()` 加一個必填的 `p_caller_user_id uuid` 參數取代內部的 `auth.uid()`(因為之後只能透過 service_role 呼叫,`auth.uid()` 在 service_role 底下是 null,這個 session 稍早處理 `revoke_organizer()`/cron cleanup 時就踩過同一個坑),`revoke execute ... from public, authenticated, anon`,只留 `service_role`。Next.js 的 `submitEntry()` 完成 Suno/MIME 驗證後,改用 `createServiceClient()` 呼叫這支 RPC,明確傳入剛剛用使用者 session 驗證過的 `user.id`。

**過程中抓到一個真的 bug,而且是我自己這次犯的**:第一版修法(`20260822120000`)只寫了 `grant execute ... to service_role`,沒有明確 `revoke` 掉 PUBLIC/authenticated/anon——真實 PoC 直接抓到:`participantClient`(一般 authenticated session)直接呼叫 `submit_entry()` 竟然**沒有報錯,而且真的把投稿寫進去了**,下一個測試(service_role 合法呼叫)因此撞到 unique constraint 衝突(那個 slot 已經被剛剛的違規呼叫佔走)。寫了暫時的診斷 function(`diag_submit_entry_acl()`,用 `pg_proc` + `aclexplode` 攤開 ACL)直接查證:`authenticated`/`anon`/PUBLIC 三者都還握有 EXECUTE。

根因:**Postgres 對新建立的 function,預設會隱含把 EXECUTE 授予 PUBLIC**,`authenticated`/`anon` 因為是 PUBLIC 的成員而自動繼承——這跟這個 session 在 table 層級已經踩過、寫進 CLAUDE.md 的坑(「REVOKE 只下給 anon/authenticated 個別角色不會生效,Supabase 建表時的預設 GRANT 是下給 PUBLIC」)是同一類問題,只是這次發生在 function 上而不是 table,而且是我自己在寫這次修復時忘記套用同一條規則——只顧著加 grant,沒有明確 revoke 掉預設授權。用新的 forward-fix migration(`20260822140000`)補上明確的 `revoke ... from public, authenticated, anon`,再用同一支診斷 function 複查確認只剩 `postgres`(owner)跟 `service_role`,驗證後移除診斷 function。

**真實 PoC(完整 20/20,含新增的 DB-02/DB-03 檢查)**:一般 authenticated session 直接呼叫 `submit_entry()` 正確被拒絕(`42501`);service_role 帶正確 `p_caller_user_id` 呼叫正常成功(模擬 Server Action 的合法路徑);就算用 service_role 呼叫,`p_caller_user_id` 跟 registration 擁有者不符也會被拒絕(防止即使拿到 service_role 存取權,也不能冒充別人投稿)。這三項連同 DB-03 的兩項檢查都已經加進 `web/scripts/security-regression.mjs`,成為長期守護,不是一次性驗證完就丟掉。

## 驗證總覽

`tsc`/`eslint`/`build` 全程乾淨。`npm run test:security` 20/20 通過(新增 5 項:DB-03 兩項 + DB-02 三項)。已 commit、push、CI 綠燈(含新的 security-regression step)、`vercel --prod` 上線。

## 這輪沒有處理的部分

DB-01(security regression CI 直接握有正式環境 service_role)這輪沒有動手——報告建議的正確修法是切出獨立的 staging Supabase + B2 環境,這是一筆真正的新基礎設施投資(第二個 Supabase 專案、第二個 B2 bucket,可能有費用),不是單純的程式碼/設定調整,留給使用者決定要不要投入。
