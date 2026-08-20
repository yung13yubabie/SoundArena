# 敏感表格只透過 SECURITY DEFINER function 寫入，不直接開放 table-level INSERT/UPDATE

資安複查（`/mattpocock-skills:diagnosing-bugs`，用真實 access token 對正式站直接打 PostgREST 驗證，非紙上審查）找到一組同樣根源的漏洞：`registrations`／`submissions`／`competitions`／`votes` 的 RLS policy 只檢查「這一列是不是你的」（row-level），完全沒有欄位層級限制。Server Action 裡預期只會送出特定欄位，但那只是慣例，不是邊界——直接繞過 Server Action 打 API，可以在 INSERT／UPDATE payload 裡夾帶任何欄位。真實驗證過的後果：報名可以自己把 `review_status` 設成 `approved`；投稿可以完全跳過 Suno 身份驗證、自己把 `status` 設成 `approved` 且公開播放；已被 `revoke_organizer()` 撤除資格的人，繞過 UI 仍能直接改動或新建比賽（DB 層從未檢查 `host_revoked_at`）。

**決定**：這幾張表的 table-level INSERT/UPDATE 從 `authenticated` 全面收回（`revoke insert, update on ... from authenticated`），改成只能透過對應的 SECURITY DEFINER function 寫入（`submit_entry`／`review_submission`／`review_registration`／`resubmit_registration`／`set_registration_eliminated`／`save_competition_schedule`／⋯）。這些 function 內部強制寫死不可信欄位的值（例如 `submit_entry()` 不接受呼叫端指定 `status`，一律寫 `pending_review`），並用 `can_manage_competition()` 或 `auth.uid()` 做權限檢查。`is_competition_organizer()` 這個所有權限判斷共用的核心也一併補上 `host_revoked_at is null`，撤除主辦資格才是真的在 DB 層生效，不再只是 UI 擋畫面。

跟既有慣例（`profiles`/`comments`/`feedback` 已經在用同一套「revoke 再用 column GRANT 開白名單」手法）比，這次選擇 RPC-only 而不是 column GRANT 白名單——因為這幾張表需要的不只是「擋掉幾個欄位」，還牽涉跨表驗證（投稿要比對 Suno handle、要檢查報名審核狀態、要檢查輪次是否同一場比賽）跟強制覆寫（狀態一律從 `pending_review` 起跳），這些邏輯用單純的欄位白名單做不到，必須是一段可以執行邏輯的 function。

**已知限制，這輪沒有解決**（後續已全部處理，見下方 Update）：`votes.voter_ip` 依然由 Next.js Server Action 讀取後當一般欄位寫入，繞過 Server Action 直接打 API 仍可偽造。Postgres/PostgREST 這一層沒有不能被同一招繞過的方式取得真正的用戶端 IP——要徹底解決需要換成「不直接對外暴露 PostgREST，所有寫入強制經過 Edge Function/Route Handler」的架構，這是比較大的改動，先誠實記錄成已知限制。`unique(round_id, voter_id)` 這個防重複依然完全有效（`voter_id` 來自 `auth.uid()`，不是使用者能指定的欄位）。`rounds`/`scoring_rules` 等賽制相關表格的欄位寬度問題（format collaborator 理論上可以碰到 name/round_index 等非賽制欄位）也還沒處理，優先度較低，留給之後。

---

**Update（同一天，2026-08-20 稍晚）**：三項已知限制都已處理完畢。

1. `votes.voter_ip` 偽造——先用真實 PoC 驗證 Supabase 前面的 Cloudflare 有 `cf-connecting-ip` 這個不可偽造的欄位，但發現它量到的是「打 PostgREST 這一段連線」的來源（合法流程下是 Vercel 的 egress IP，不是使用者瀏覽器 IP），直接拿來用反而會讓所有正常投票的 `voter_ip` 撞在一起、互相擋票，比原本的漏洞更糟。真正決定：`votes` 的 INSERT 對 `authenticated` 全面收回，`castVote()` 改用 `service_role` 寫入（`web/src/lib/supabase/service.ts`），這是整個專案第一次在應用程式路徑用 service_role。完整推理過程與已驗證結果記在 [ADR-0012](./0012-votes-service-role-write.md)。
2. `rounds`/`competitions` 欄位寬度——過程中額外發現一個真的壞掉的迴歸：`competitions` 的 UPDATE 已經在本 ADR revoke 掉，但 `admin/format/actions.ts` 的 `updateCompetitionMeta()`（改比賽名稱）當時沒有一起改成 RPC，是壞的（打下去會 42501）。一併修掉，並把 `rounds` 的 INSERT/UPDATE/DELETE 也全面收回，依 format/schedule 兩種權限拆成 6 支 RPC（`update_competition_name`／`create_initial_rounds`／`add_round`／`remove_round`／`set_round_anonymity`／`set_all_rounds_anonymity`／`set_round_schedule_windows`）。`scoring_rules`/`score_items`/`round_format_blocks` 三張表本來就只檢查單一 `'format'` 權限、沒有 format-or-schedule 的 OR，不存在同樣的跨權限洩漏，沒有動。已用真實 collaborator 帳號（format-only／schedule-only 各一個）驗證：各自能做自己權限範圍內的事、被擋在對方權限範圍外、繞過 RPC 直打 PostgREST 一律 42501。見 `supabase/migrations/20260820090000_rounds_and_competition_name_rpc.sql`。
3. Feedback / Comment rate limit——加了兩支 `BEFORE INSERT` trigger（`feedback`：20 秒一次，`comments`：3 秒一次），都標成 `SECURITY DEFINER`——這輪修 `check_vote_validity()` 踩過「trigger 預設 SECURITY INVOKER，內部查詢被呼叫者自己的 RLS 擋住看不到資料」的坑，這裡直接避開同一類問題。見 `supabase/migrations/20260820100000_feedback_comment_rate_limit.sql`。
