# 第二輪獨立複查(2026-08-21):併發防禦、輸入驗證、錯誤外洩

使用者發起第二輪獨立複查,這次涵蓋兩個他自己直接發現的產品問題,加上另一份第三方 AI 複查報告。跟第一輪(ADR-0011/0012)一樣,報告內容先實測驗證,不直接假設為真。

## 1. Suno 帳號欄位可誤填非 Suno 網址

`RegisterForm.tsx` 的「Suno 帳號名稱或個人主頁網址」欄位過去完全沒驗證格式,查production 資料庫時真的找到一筆 `suno_handle = "https://youtube.com/@..."` 的既有報名(狀態仍是 `pending_review`,還沒被誤核准)。新增 `web/src/lib/suno.ts` 的 `parseSunoHandle()`:純帳號名稱直接放行;看起來像網址的一律要求是 `suno.com/@handle` 這個個人主頁格式,網域不對就明確告知偵測到的是哪個網域。前後端都套用(`register/actions.ts` 為準,`RegisterForm.tsx` 做即時提示)。這不是身份驗證繞過(投稿時 `submit_entry` 仍會拿真實 Suno API 重新驗證一次),純粹是資料品質/UX 問題——填錯的人會在投稿階段卡死,不知道為什麼。

## 2. Rate limit 有 TOCTOU 競態條件(第三方複查抓到,已確認為真)

ADR-0011 加的 `feedback`/`comments` rate-limit trigger 是「SELECT EXISTS 有沒有最近紀錄 → 沒有就放行 INSERT」,併發下多個 transaction 可能同時通過檢查。用真實併發 PoC 證實:20 併發放行 1 筆、50 併發放行 5 筆、100 併發放行 6 筆(理論上不管併發多少都該只放 1 筆)。改用 `pg_advisory_xact_lock(hashtext('<table>:' || user_id))` 讓同一使用者的請求在檢查+寫入這段關鍵區間強制序列化,修復後 20/50/100 併發都精準只放行 1 筆。

## 3. verifySunoSharer() 沒有 auth/rate limit,可被當免費 API 代理濫用

新增 `suno_verify_attempts` 表 + `check_suno_verify_rate_limit()` RPC(同一套 advisory lock 手法,2 秒冷卻),`verifySunoSharer()` 呼叫真正的 Suno API 之前先要求登入、先過這個限制。未登入呼叫直接拒絕;已登入使用者最多 2 秒呼叫一次,一般人手動貼連結不會撞到,腳本狂打會被卡死。

## 4. 自由輸入欄位沒有長度上限(storage/bandwidth DoS)

`feedback.message`/`comments.body`/`submissions.title`/`submissions.lyrics`/`registrations.display_name`/`registrations.suno_handle`/`profiles.bio`/`profiles.social_link`/`profiles.featured_track_url`/`competitions.name`/`competitions.description` 等欄位原本是純 `text`,沒有任何長度限制。補上 DB check constraint(最後一道防線)+ 對應 Server Action 的伺服器端驗證(先給使用者看得懂的訊息,不要讓請求打到 DB 才被 constraint 擋掉)。

## 5. 原始 Postgres 錯誤直接外露給使用者

多支 Server Action 過去是 `return { error: error.message }`,會把 constraint 名稱、function 名稱等內部資訊直接丟給使用者。新增 `web/src/lib/actionError.ts` 的 `toFriendlyError()`:已知錯誤(unique violation、trigger raise 的訊息等)對應清楚的中文訊息;沒對到的一律變成「操作失敗 + 隨機錯誤代碼」,真正的錯誤內容改記到伺服器 log(Vercel function log),已套用到 votes/submissions/registrations/comments/feedback/collaborators/format/schedule/review/judge/profile 全部相關 Server Action。

## 6. UX:假的上傳拖曳區 + 過時的儲存服務文案

`submit/SubmitForm.tsx` 的音檔上傳區塊過去是純裝飾性 `<div>`,看起來能拖放/點擊選檔,實際沒有任何 `<input type="file">`、沒有任何互動邏輯,而且文案還寫著已經換掉的 Cloudflare R2。既然音檔上傳功能還沒真正做,依照「沒做完就整塊隱藏,不要給假控制項」的原則,換成誠實的「這個功能還沒開放」提示;`competitions/CompetitionBrowser.tsx` 同一批過時的 R2 文案也一併修掉。

## 這輪確認過、判定不是漏洞的部分

- **x-forwarded-for 偽造**:第三方複查列為「最高優先正式環境 PoC」。實際部署一支暫時的 header 回顯端點到 production 測試,用偽造的 `X-Forwarded-For`(單一值、逗號列表)打過,Vercel 回傳的 `x-forwarded-for`/`x-real-ip`/`x-vercel-forwarded-for` 全部都是真實連線 IP,偽造值完全被 Vercel edge 覆寫、進不了 Next.js。`vote/actions.ts` 現有的 `getClientIp()` 寫法(`split(",")[0]`)在 Vercel 上是安全的,不需要換架構。測試端點已刪除,不留在 codebase 裡。

## 這輪誠實記錄、還沒處理的部分

- **主辦資格「審核制」**:目前是自助送出即完成,使用者明確表示希望改成需要平台管理員審核通過才能成為主辦人——這是對 ADR-0010 決策的反轉,需要先確認既有主辦人是否要一併重新送審,再動手,見這次對話的後續討論。
- **比賽刪除功能**:目前完全沒有任何刪除比賽的路徑(自助或平台管理員都沒有),誤建立的比賽無法清除。需要先確認刪除權限範圍(草稿階段自助 vs 一律走平台管理員)。
- **Discord OAuth consent 文案矛盾**:頁面文案宣稱「可以跳過,之後再連結」,但實際 OAuth scope 直接要求 `guilds.join` 且登入後自動嘗試加入 Discord 伺服器,沒有真正的「僅登入不加入」路徑。第三方複查建議拆成兩段式 OAuth(先 `identify` 登入,願意的話再另外一次 `guilds.join` 授權),這是 auth 流程改動,還沒動手。
- **CSP 仍是基礎版**:`script-src`/`style-src` 還在用 `unsafe-inline`,還沒做 nonce-based CSP;也還沒實際 probe production 收到的完整 HTTP response header(HSTS/COOP/CORP 等),只看過 `next.config.ts` 裡宣告的值。
