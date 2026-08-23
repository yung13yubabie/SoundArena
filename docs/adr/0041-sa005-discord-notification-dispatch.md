# ADR-0041:SA-005 第一批——Discord 通知真的送出去(投稿/報名成功)

使用者確認要開始做 SA-005,先做 Discord DM 通知這一批(email 走 Resend 的架構同步建好,但這批只實際驗證 Discord)。

## 查證後發現:架構本來就在,缺的只是「sender」

查 `notification_events` 相關 5 個 migration 後發現這套系統遠比想像中完整:`create_notification_event()` 已經在 `submitEntry()`/`registerForCompetition()` 成功路徑被呼叫,正確依登入方式判斷 channel(Google → email、Discord → discord)、正確產生固定文案(ADR-0015 已把 title/body 收斂成 server 端依 `event_type` + `resource_id` 產生,呼叫端無法注入內容)、正確處理取消訂閱(`skipped` 狀態)。`status` 預設 `pending`,唯一缺的是「真的把 pending 事件送出去」的那支 sender——`20260819070000` migration 的設計註解自己就寫明白:「等寄信服務商/Discord webhook 接上,只要新增一支 background worker...架構完全相容不用重構」。

另外查證發現兩個從建置以來就沒被填上的缺口:
1. `profiles.discord_user_id` 欄位從建表起沒有任何程式碼寫入過(`20260816120000` migration 註解自承)。
2. `.env.local` 的 `DISCORD_GUILD_ID` 是空的,bot token 雖然存在但從未真正被邀進任何伺服器——`auth/callback/route.ts` 的自動加入伺服器邏輯一直是 no-op。

## 修法

**基礎設施(使用者手動完成,過程中排除了幾個 Discord 平台限制)**:
- 建立真實 Discord 伺服器、邀請 bot 加入(查證確認 Discord 平台限制:bot 私訊使用者的前提是兩者要有共同伺服器,不存在純粹一對一私訊路徑,來源見 [Discord 官方支援文章](https://support.discord.com/hc/en-us/articles/360060145013-Why-isn-t-my-DM-going-through))。
- `DISCORD_GUILD_ID`/`RESEND_API_KEY` 補進 `.env.local` 跟 Vercel production 環境變數。

**`auth/callback/route.ts`**:`joinDiscordGuild()` 補上寫入 `profiles.discord_user_id`(用 `createServiceClient()`——這個欄位設計上排除 `authenticated` 角色存取,一般 RLS-bound client 寫不進去)。

**`create_notification_event()` RPC**:回傳型別從 `void` 改成 `uuid`(新建事件的 id),讓呼叫端能立即嘗試發送——查證發現這個專案在 Vercel **Hobby 方案**,cron 一天只能跑一次且有 ±59 分鐘誤差,純靠 cron 兜底的話「投稿成功」通知可能要等將近一天才送到。改成比照這個 session 已經在用的 B2 清理模式(立即嘗試 + cron 兜底):`register/actions.ts`/`submit/actions.ts` 在事件建立後立即呼叫新的 `dispatchNotificationEvent()`,失敗才留給每日 cron(新增的 `/api/cron/dispatch-notifications`)重試。

**新增檔案**:`web/src/lib/discord.ts`(開 DM 頻道 + 送訊息)、`web/src/lib/email.ts`(Resend REST API,先用 `onboarding@resend.dev`,之後換正式網域只需改一個常數)、`web/src/lib/notifications.ts`(共用的 `dispatchNotificationEvent()`,兩種管道共用同一套「沒有送達目的地 → 永久 failed;API 呼叫失敗 → 留 pending 給 cron 重試」邏輯)。

## 驗證

DB 端邏輯真實 PoC(4/4):`create_notification_event()` 正確回傳 uuid、正確判斷 channel、沒有 `discord_user_id` 時正確標記永久 `failed`。真實端對端 PoC(3/3,對使用者本人的真實 Discord 帳號):建立事件 → 真的開 DM 頻道 → 真的送出訊息,使用者在 Discord 收到真實私訊確認。`web/scripts/security-regression.mjs` 完整跑過(30/30,確認 RPC 簽章變更沒有破壞既有安全邊界)。`tsc`/`eslint`/`build` 全程乾淨。

## 誠實記錄還沒做的部分

Email 管道的 sender/dispatch 邏輯已經寫好、跟 Discord 共用同一套 `dispatchNotificationEvent()`,但**沒有真實寄過一封信驗證**——這批的真人驗證只涵蓋 Discord。網域驗證(`no-reply@soundarena.com`)還沒開始,目前用 Resend 預設的 `onboarding@resend.dev`。「建立比賽自動接入 Discord 討論頻道」是另一個明確排到後面的獨立功能,這批沒有做。
