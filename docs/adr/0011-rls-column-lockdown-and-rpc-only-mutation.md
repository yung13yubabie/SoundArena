# 敏感表格只透過 SECURITY DEFINER function 寫入，不直接開放 table-level INSERT/UPDATE

資安複查（`/mattpocock-skills:diagnosing-bugs`，用真實 access token 對正式站直接打 PostgREST 驗證，非紙上審查）找到一組同樣根源的漏洞：`registrations`／`submissions`／`competitions`／`votes` 的 RLS policy 只檢查「這一列是不是你的」（row-level），完全沒有欄位層級限制。Server Action 裡預期只會送出特定欄位，但那只是慣例，不是邊界——直接繞過 Server Action 打 API，可以在 INSERT／UPDATE payload 裡夾帶任何欄位。真實驗證過的後果：報名可以自己把 `review_status` 設成 `approved`；投稿可以完全跳過 Suno 身份驗證、自己把 `status` 設成 `approved` 且公開播放；已被 `revoke_organizer()` 撤除資格的人，繞過 UI 仍能直接改動或新建比賽（DB 層從未檢查 `host_revoked_at`）。

**決定**：這幾張表的 table-level INSERT/UPDATE 從 `authenticated` 全面收回（`revoke insert, update on ... from authenticated`），改成只能透過對應的 SECURITY DEFINER function 寫入（`submit_entry`／`review_submission`／`review_registration`／`resubmit_registration`／`set_registration_eliminated`／`save_competition_schedule`／⋯）。這些 function 內部強制寫死不可信欄位的值（例如 `submit_entry()` 不接受呼叫端指定 `status`，一律寫 `pending_review`），並用 `can_manage_competition()` 或 `auth.uid()` 做權限檢查。`is_competition_organizer()` 這個所有權限判斷共用的核心也一併補上 `host_revoked_at is null`，撤除主辦資格才是真的在 DB 層生效，不再只是 UI 擋畫面。

跟既有慣例（`profiles`/`comments`/`feedback` 已經在用同一套「revoke 再用 column GRANT 開白名單」手法）比，這次選擇 RPC-only 而不是 column GRANT 白名單——因為這幾張表需要的不只是「擋掉幾個欄位」，還牽涉跨表驗證（投稿要比對 Suno handle、要檢查報名審核狀態、要檢查輪次是否同一場比賽）跟強制覆寫（狀態一律從 `pending_review` 起跳），這些邏輯用單純的欄位白名單做不到，必須是一段可以執行邏輯的 function。

**已知限制，這輪沒有解決**：`votes.voter_ip` 依然由 Next.js Server Action 讀取後當一般欄位寫入，繞過 Server Action 直接打 API 仍可偽造。Postgres/PostgREST 這一層沒有不能被同一招繞過的方式取得真正的用戶端 IP——要徹底解決需要換成「不直接對外暴露 PostgREST，所有寫入強制經過 Edge Function/Route Handler」的架構，這是比較大的改動，先誠實記錄成已知限制。`unique(round_id, voter_id)` 這個防重複依然完全有效（`voter_id` 來自 `auth.uid()`，不是使用者能指定的欄位）。`rounds`/`scoring_rules` 等賽制相關表格的欄位寬度問題（format collaborator 理論上可以碰到 name/round_index 等非賽制欄位）也還沒處理，優先度較低，留給之後。
