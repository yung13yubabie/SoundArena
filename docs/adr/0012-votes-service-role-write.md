# votes 的寫入改用 service_role,不再對 authenticated 開放

ADR-0011 記錄了一個已知限制:`votes.voter_ip` 由 Next.js Server Action 讀取 `x-forwarded-for` 後當一般欄位寫入，繞過 Server Action 直接打 PostgREST 的人可以自己填任意 `voter_ip`，讓「同 IP 同輪只能投一票」這道防灌票失效。當時記錄成「要徹底解決需要換架構，先誠實記錄成已知限制」。

**先實測，再決定要不要換架構**：寫了一支暫時的 SECURITY DEFINER 診斷 function 回傳 `current_setting('request.headers', true)`，用真實 HTTP 請求直接打 PostgREST，並在請求裡塞偽造的 `X-Forwarded-For`。結果發現 Supabase 前面的 Cloudflare 會把量到的真實連線 IP 寫進 `cf-connecting-ip`，而且會直接覆寫/附加，不採信 client 自報的 `X-Forwarded-For` 值——這個欄位本身不可偽造。

但這個發現對這個場景沒有幫助，反而戳破了一個更根本的問題：SoundArena 的合法投票流程是「瀏覽器 → Vercel（Next.js Server Action）→ Supabase PostgREST」，對 Supabase 而言，打這支 API 的連線來源永遠是 Vercel 的 serverless egress IP，不是真正投票那個人的瀏覽器 IP。如果改成在 Postgres 這一層讀 `cf-connecting-ip` 當 `voter_ip`，會變成所有經過正常網站投票的人 `voter_ip` 都幾乎相同（都是 Vercel 那端的），`unique(round_id, voter_ip)` 反而會把不同使用者的正常投票互相擋掉——比原本「防不了灌票」的漏洞還嚴重，是會壞掉正常功能的錯误修法。

真正的問題根源：`voter_ip` 這個值只有「瀏覽器 → Vercel」這一段量得到（Next.js 的 `headers()` 讀 Vercel 正確設定的 `x-forwarded-for`），Supabase 這一層完全看不到、也補不回來。既然信任邊界只能落在 Next.js 這一層，就不該假裝 Postgres 這一層能自己驗證這個值。

**決定**：`votes` 的 INSERT 對 `authenticated` 全面收回（`revoke insert on votes from authenticated`），不做 column GRANT 白名單、不做 RPC，因為兩者都還是要讓 `authenticated` 角色能碰這張表，攻擊者依然能繞過 Next.js 直接打。改成 Next.js 的 `castVote()` Server Action 用 `service_role`（`web/src/lib/supabase/service.ts`）直接寫入——`service_role` 不受 RLS 限制，但依然會觸發 `check_vote_validity()` trigger（trigger 對所有角色一視同仁，只有 RLS/GRANT 會被 service_role 繞過）。這樣一來，`votes` 唯一合法的寫入路徑就是這支 Server Action：繞過 Next.js 直接打 PostgREST 的人，不管填什麼 `voter_id`／`voter_ip`，都會先被「沒有 INSERT 權限」擋下，連嘗試偽造的機會都沒有。

這是整個專案第一次在應用程式執行路徑（不只是測試/診斷腳本）使用 `service_role`。這把信任邊界從「資料庫規則」搬到「一段可以審查的伺服器程式碼」，範圍必須嚴格限制在 `castVote()` 這一個函式；`voter_id` 依然來自 `supabase.auth.getUser()` 驗證過的 session（不是呼叫端能指定的參數），`check_vote_validity()` 的所有業務規則檢查（時間窗、投稿狀態、報名狀態、不能投自己）保持不變、依然強制執行。之後若有其他表格出現類似「信任邊界在 Next.js 而非 Postgres」的情況，才考慮比照這個模式；預設仍然優先用 RLS/RPC，service_role 是例外不是常態。

**已重新驗證**：`unique(round_id, voter_id)` 防重複帳號投票不受影響（`voter_id` 現在由 service_role client 明確帶入，仍等於 `auth.uid()`）；`unique(round_id, voter_ip)` 防同網路灌票恢復可信——這個 IP 現在只可能來自 Next.js 這一層量到的真實瀏覽器 IP，不再有任何路徑能被偽造覆蓋。
