# ADR-0035:DB-08——刪除投稿/比賽時,B2 音檔追蹤不能隨著那一列一起消失

第二輪第三方稽核報告點名:`delete_own_submission()`(使用者自助刪除投稿重新上傳)跟 `delete_competition()`(PlatformAdmin 強制刪除)這兩條路徑,理論上都可能在 B2 留下沒有任何 DB 紀錄可以追蹤的孤兒音檔。

## 根因:既有的「B2 沒刪成功就保留 DB 紀錄」原則,對「刪整列」這種情況失效

SA-006/ADR-0026 已經確立的原則是:B2 delete 沒成功,就不要清掉 DB 上的 `audio_object_key` 欄位,讓下次 cron 執行時因為這個欄位還在而自然重試。這個原則的前提是「那一列本身還在」——但 `delete_own_submission()`/`delete_competition()` 刪的正是那一列本身(`submissions`/`competitions`)。一旦這一列真的被刪掉,`audio_object_key` 就從任何一張表上徹底消失,B2 上的檔案變成完全沒有任何紀錄可以追蹤的真孤兒,`/api/cron/cleanup-audio` 掃描不到它,永遠不會被清掉。

查證範圍後發現:一般 organizer 自助刪除比賽(`delete_competition()` 非 PlatformAdmin 路徑)在 DB 層本來就要求 `registration_count = 0` 才准刪,這條路徑天生沒有音檔可以孤兒化;真正有風險的只有 PlatformAdmin 繞過這道檢查、強制刪除已有真實投稿的比賽,以及使用者自助刪除自己還沒被投票的投稿這兩條路徑。

## 修法:比照 pending_uploads 的獨立追蹤表精神

新增 `audio_pending_deletion` 表(`object_key`、`reason`、`created_at`),在這兩支 SECURITY DEFINER RPC 真的刪除那一列**之前**,先把即將孤兒化的 `audio_object_key`(可能不只一個——一場比賽底下所有投稿)寫進這張表。表本身刪不刪都不影響追蹤紀錄,因為寫入跟原本的刪除動作在同一個 transaction 裡。

- `delete_own_submission()`:簽章沒變(`uuid -> text`),`create or replace` 就夠。
- `delete_competition()`:回傳型別從 `void` 改成 `text[]`(這場比賽底下所有投稿的 audio_object_key),讓 Next.js 那層也能盡力立即清 B2——回傳型別變更,照這個 session 已確立的規則,先 `drop function` 再 `create function`,不能直接 `create or replace`。

`audio_pending_deletion` 只有 service_role(cron)跟這兩支 RPC(以 table owner 身份執行,不受 RLS 限制)需要碰——啟用 RLS(不給任何 policy,預設拒絕)之外,額外明確 `revoke all ... from public, anon, authenticated`,雙重保險(這個 session 已經在 DB-02 的 function GRANT 上踩過一次「Supabase 建表/建函式預設隱含授予 PUBLIC」的坑)。

`web/src/app/api/cron/cleanup-audio/route.ts` 新增一段掃描,邏輯跟既有的 `pending_uploads` 孤兒掃描完全對稱:讀出 `audio_pending_deletion` 全部紀錄,B2 真的刪除成功才把追蹤紀錄清掉,失敗就留著等下次重試。不需要緩衝期(不像 `pending_uploads` 要等 48 小時避免誤刪還在填表單的合法上傳——這裡寫入的都是使用者/PlatformAdmin 已經確定要刪除的資源)。

`web/src/app/admin/format/actions.ts` 的 `deleteCompetition()` 改成用 RPC 回傳的 `text[]` 立即嘗試清 B2(盡力而為,清不掉也沒關係,追蹤表已經保底)。

## 驗證

一次性 PoC(16/16 通過,對正式 Supabase + 真實 B2 bucket 執行):`delete_own_submission()`/`delete_competition()` 正確寫入追蹤紀錄且回傳正確的 key;`audio_object_key` 為 null 時不寫入任何紀錄;一般 organizer 對有真實報名的比賽仍被擋下(既有行為沒被破壞);一般 `authenticated` 角色無法直接讀 `audio_pending_deletion`;模擬 cron 掃描邏輯真的把兩個真實 B2 物件刪除、追蹤紀錄清空。

`web/scripts/security-regression.mjs` 新增 4 項長期守護檢查(DB 層行為,不碰真實 B2——CI 的 `ci-security-test` environment 沒有配置 B2 憑證,真實 B2 刪除只在一次性 PoC 驗證過),`npm run test:security` 24/24 通過。`tsc`/`eslint`/`build` 全程乾淨。

## 順手發現、刻意不在這次處理的相關問題

查證 `delete_competition()` 過程中發現 `remove_round()`(單一輪次移除)完全沒有「這一輪是否已有真實報名/投稿/選票」的檢查,只擋「不能移除第一輪或最後一輪」——跟 `delete_own_submission()` 特地為了不讓已投出的票被 cascade 默默清掉而擋住投票開始後的刪除相比,`remove_round()` 對中間輪次沒有任何等價保護。這是資料完整性問題(可能默默刪掉真實選票),不是 B2 儲存孤兒問題,已超出 DB-08 原本的稽核範圍,也不在第二輪報告的既有 finding 清單裡——留給使用者決定是否要處理、以及該套用哪種保護規則(完全禁止移除有資料的輪次,還是比照投票開始後鎖定)。
