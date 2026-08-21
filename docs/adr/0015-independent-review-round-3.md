# 第三輪獨立複查(2026-08-21):Suno 連結釣魚、刪除比賽 TOCTOU、通知內容注入

使用者要求這輪用 `systematic-debugging`／`debugging-and-error-recovery` 兩個 Skill 搭配既有的 `mattpocock-skills:diagnosing-bugs` 紀律處理。跟前兩輪一樣,報告內容先實測驗證,不直接假設為真;這輪額外用了「注入延遲」技巧去逼出一個原本極窄、單線操作幾乎不可能撞到的競態窗口。

## 1. Suno 投稿分享連結可偽裝成釣魚網站(P1,已確認為真並修復)

`verifySunoSharer()` 舊版只用 `/\/s\/([A-Za-z0-9]+)/` 這種 regex 從字串裡抓 code,完全不檢查網域。攻擊者可以構造 `https://evil.example/s/<自己真實的 suno code>`——code 是真的,Suno API 驗證會通過,但 DB 存的是 `evil.example` 這個網址,顯示給其他人的卻是「SoundArena 已驗證作品」的信任外殼包裝的釣魚連結。

**驗證**:直接繞過 Next.js,對 `submit_entry()` RPC 打 `p_suno_share_url = "https://evil.example/s/ABC123xyz"`,修復前確實 200 成功、DB 也真的存了這個網址;修復後同一個請求被擋下(`"suno_share_url must be a canonical https://suno.com/s/<code> link"`),DB 沒有任何殘留。

**修法**:`web/src/lib/suno.ts` 新增 `parseSunoShareUrl()`——必須 `https`、hostname 必須是 `suno.com`,通過才抽 code,回傳的是 canonical 網址(`https://suno.com/s/<code>`),不是使用者原始輸入。`verifySunoSharer()` 改用這支,存進 DB 的一律是 canonical 版本。`submit_entry()` RPC 也補了第二層防護(regex 驗證 `p_suno_share_url` 格式),不只信任 Next.js 有沒有乖乖驗證——這樣繞過 Next.js 直接打 RPC 依然會被擋下。

## 2. 刪除比賽有 TOCTOU 競態,會悄悄吃掉剛報名成功的人(P1,已確認為真並修復)

`delete_competition()` 原本是「查報名數 → 判斷 → 刪除」三個獨立步驟,不是原子操作。理論上存在一個窗口:主辦人的刪除查完「報名數 = 0」之後、真正執行 DELETE 之前,如果剛好有人報名成功,`ON DELETE CASCADE` 會把這筆剛成功的報名一起清掉,使用者收到「報名成功」卻悄悄消失,完全沒有錯誤訊息。

這個窗口在正常單線操作下窄到幾乎不可能自然撞到(兩個 SQL 陳述式之間沒有任何網路 I/O,執行間隔通常是微秒等級)。為了能穩定驗證,寫了一支暫時的診斷 function,用 `pg_sleep()` 把窗口人工放大到 2 秒,並用參數切換「有沒有先上鎖」:
- **沒上鎖(對應舊版行為)**:併發報名在 sleep 期間成功回報 201,delete 完成後獨立查詢確認這筆報名已經消失——**資料遺失確認發生**。
- **有上鎖(對應修復後的版本)**:併發報名被卡住等待(約 1.7 秒),鎖釋放後 delete 已經完成,報名的外鍵檢查發現比賽已經不存在,回報清楚的 409 外鍵錯誤,不是悄悄消失——**沒有資料遺失**。

**修法**:`delete_competition()` 在檢查報名數之前先對這一列 `select ... for update`。`FOR UPDATE` 跟 FK 檢查用的 `FOR KEY SHARE` 互斥,鎖定期間任何 `INSERT INTO registrations` 參照這場比賽都會被擋住等待,直到這個 transaction 結束為止——確保「查報名數」跟「真的刪除」之間不可能有新報名悄悄插進來又被吃掉。診斷用的暫時 function 已經刪除,不留在 codebase 裡。

## 3. 公開主辦人名單沒跟著審核制一起改(P1,已確認為真並修復)

ADR-0014 把主辦資格改成審核制之後,`list_public_organizers()`(`/organizers` 頁面用的 RPC)忘記一起補 `host_approved_at is not null`——後台說「這個人還在待審核」,公開頁面卻照樣把他列為正式主辦人,兩邊的信任狀態不一致。已補上這個條件,並用真實查詢驗證過:待審核的帳號不會出現在公開名單。

## 4. 通知事件 RPC 內容完全不受限(P1,列為 Resend 上線前 blocker)

`create_notification_event()` 上一輪只補了「誰能呼叫」的權限檢查,完全沒管內容——`event_type`/`title`/`body` 呼叫端可以填任意字串、任意長度,而且有 `'review'` 權限的人可以對任何 `p_user_id` 建立事件,不需要對方真的是這場比賽的參賽者。現在 Resend/Discord 還沒接上,危害主要是灌爆資料表;接上之後會升級成郵件/Discord 額度濫用或內容偽造。

這輪先做三件成本低、立即生效的加固:`event_type` 限制成目前實際會用到的兩種值、`title`/`body` 補長度上限、用 `'review'` 權限幫別人建事件時對方必須是真正的參賽者(有對應的 registrations row)。新增 `created_by` 欄位記錄真正呼叫者(不一定等於事件的 `user_id`),補上跟 feedback/comments 同一套 advisory lock rate limit(3 秒一次)——沒有這欄,rate limit 沒辦法正確限制「呼叫者」,只能限制「事件對象」,幫別人發事件的濫用完全不受限。全部用真實帳號 PoC 驗證過:亂填 event_type/超長內容/對非參賽者發事件全部被擋,對真正參賽者發事件成功,連續呼叫被冷卻擋下。

**完整的架構修法還沒做,列成 Resend 上線前的 blocker**:呼叫端不該傳 `title`/`body`,應該傳 `event_type` + `resource_id`,由伺服器端依語意自己產生內容。這是比較大的重構(要動兩個呼叫點的語意跟 schema),等真的要接 Resend 前再做。

## 5. Suno 驗證的 2 秒冷卻會誤傷合法的送出流程(P1,已確認結構性存在並修復)

投稿流程會呼叫 `verifySunoSharer()` 兩次——使用者離開網址欄位時前端先呼叫一次(preflight),真正送出投稿時 `submitEntry()` 為了安全又在伺服器端重新呼叫一次(防止繞過 preflight 直接呼叫 `submitEntry` 帶假身份)。這兩次呼叫舊版共用同一個「這個使用者每 2 秒一次」的 rate limit,如果使用者 preflight 完馬上按送出,兩次呼叫距離可能不到 2 秒,合法的送出流程會被自己的防濫用機制誤傷,而且會顯示成「Suno 分享連結驗證失敗」,使用者會誤以為連結本身有問題。

**修法**:cooldown 的判斷單位從「這個使用者」改成「這個使用者 + 這個 code」——同一個 code 短時間內重複驗證不受限(preflight 跟送出時驗的是同一個連結,也就是同一個 code),但快速切換成不同 code 依然會被擋下,對「拿這支 API 當免費代理狂查一堆不同連結」的濫用防護沒有減弱。用真實帳號驗證過:同一個 code 連續驗證兩次都成功,緊接著換一個不同 code 立刻被擋。

## P2 次級修復

- `review_submission()` 的 `p_status` 參數型別是完整的 `submission_status` enum(含 `draft`/`identity_checking`/`identity_matched`/`identity_mismatched` 四個這支 RPC 職責範圍外的值),有 `'review'` 權限的人繞過 UI 理論上能設成這些值。已加白名單只接受 `approved`/`rejected`/`pending_review`。
- 「主辦人管理」畫面的「重新賦予」按鈕,對從沒被核准過的人(已駁回)點下去,實際只會清 `host_revoked_at`,不會設 `host_approved_at`,效果只是回到待審核,不是真的恢復主辦資格——文案沒有反映這個差異。已改成依 `host_approved_at` 是否曾經被設過,分別顯示「重新賦予」或「移回待審核」。
- `AdminShell.tsx` 三處 SELECT 讀取失敗時直接顯示 Supabase 的 `error.message`(這是 client component,不能用 server-only 的 `toFriendlyError`)。已改成統一的「載入失敗，請重新整理頁面再試一次」,真正的錯誤內容改用 `console.error` 留在瀏覽器 console。

## 工程 P1:main 分支目前沒有任何保護(已確認現況,交由使用者決定是否啟用)

`gh api repos/.../branches/main/protection` 回傳 404("Branch not protected")——確認為真。這輪所有 migration/RPC 修法都是直接 push 到 main 上線,一次誤操作理論上可以直接影響 production。啟用 branch protection(禁止 force push、要求 PR review、要求 CI 通過)會改變目前「本 session 直接 push+deploy」的協作模式,這是工作流程層級的決定,交由使用者自己決定要不要啟用、啟用到什麼嚴格程度,這裡沒有直接動手。

## 這輪沒有動的部分

Backblaze B2 物件孤兒清理(比賽被 cascade 刪除後,B2 上的音檔不會跟著刪)——上傳功能本身還沒上線,目前不是立即漏洞,等 B2 上傳 UI 真的做的時候一起處理。
