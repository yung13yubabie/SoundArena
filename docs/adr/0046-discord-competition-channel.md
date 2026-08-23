# ADR-0046:建立比賽自動開 Discord 頻道 + 報名自動加入

賽制細節之外,使用者這輪臨時提出的獨立新想法(不是 SPEC.md 原本規劃的項目):建立比賽時自動在既有 Discord 伺服器開一個私人頻道,報名者自動取得存取權,不用主辦人自己手動邀請。

## 設計

沿用既有 SA-005 的 Discord 基礎設施(`DISCORD_GUILD_ID`、`DISCORD_BOT_TOKEN`,同一個 Bot),不開新伺服器——查證確認 Discord 私訊本來就要求 Bot 跟收件人在同一個伺服器,再開一個伺服器只會讓事情更複雜。

- **頻道建立**:`create_competition_full()` 之後(`admin/format/actions.ts` 的 `createCompetition()`),最佳努力呼叫 Discord API 在 `DISCORD_GUILD_ID` 底下開一個文字頻道,頻道名稱是比賽名稱轉成的 slug。
- **私人頻道**:對 `@everyone` deny `VIEW_CHANNEL`,只有主辦人(建立當下自動授權)跟後續報名的人(`registerForCompetition()` 之後最佳努力授權)透過頻道層級的權限覆寫個別開放。
- **`competitions.discord_channel_id`**:比照 `profiles.discord_user_id` 的既有先例,不開放 `authenticated` 直接寫(這張表本來就已經 `revoke update ... from authenticated`,寫入一律走 service_role),避免使用者能把自己比賽的頻道欄位改成任意值。
- **只有 Discord 登入的人能加入**:跟通知管道同一個限制——Google 登入的人沒有 `discord_user_id`,安靜跳過,不影響報名本身成功。

## 真實 PoC 踩到的兩個坑

1. **Bot 權限查證發現真實缺口**:一開始 Bot 只有「管理頻道」權限(能建立頻道),沒有「管理身分組」權限——Discord 要對頻道做「特定成員」層級的權限覆寫,需要這個權限,不是「管理頻道」就夠。查證後請使用者直接在 Discord 伺服器設定裡幫既有身分組加開這個權限,不需要重新邀請 Bot、不需要走 OAuth 重新授權。
2. **Bot 把自己鎖在門外**:第一版建立頻道只設定「`@everyone` 看不到」,沒有同時允許 Bot 自己看得到——Discord 的頻道層級 deny 會蓋過 Bot 在伺服器層級的權限,建立頻道後 Bot 自己呼叫 GET/PUT 那個頻道全部回 403。修法是建立頻道的同一次 API 呼叫裡,順便把 Bot 自己也加進權限覆寫清單(allow VIEW_CHANNEL 等)。這是先跑真實 PoC 才抓到的,不是憑經驗猜的。

## 驗證

真實 PoC(9/9,對正式 Supabase 環境 + 真實 Discord 伺服器):真的在 Discord 建立一個私人頻道、確認 `@everyone` 被 deny、確認主辦人(使用者本人的真實 Discord 帳號)被自動授予存取權(打 API 直接驗證 permission overwrite 內容,不是只看回傳成功)、確認 Google 登入沒有 `discord_user_id` 時報名本身不受影響、測試頻道跑完立刻刪除清乾淨。`security-regression.mjs` 新增 1 項(`discord_channel_id` 不開放 authenticated 直接寫),49/49 通過。`tsc`/`eslint`/`build` 全程乾淨。

**尚未驗證**:沒有第二個真實 Discord 帳號可用,報名觸發的頻道加入邏輯只驗證到「資料庫層面能正確查到 `discord_channel_id`」,底層呼叫的 API 函式已經用主辦人自動授權那步驗證過同一支函式對真實帳號有效——但沒有用第二個不同身份的真實帳號重新走一次報名流程。

## 未涵蓋(刻意延後)

比賽結束後頻道要不要封存/刪除——沒有問過使用者,維持頻道永久存在,之後有需要再補。
