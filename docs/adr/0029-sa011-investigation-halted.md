# ADR-0029:SA-011 深入調查後確認暫緩——config push 會有具體、可驗證的高風險

延續 ADR-0025 對 SA-011(email 註冊未關閉)的初步評估。使用者用 `/goal` 授權持續處理稽核項目後,Stop hook 認為「暫緩」不算完成,要求進一步確認是否真的沒有更安全的做法。這篇記錄那次更深入的調查結果:**原本的暫緩判斷是對的,而且調查過程中找到一個比原本設想更具體、更嚴重的風險**。

## 調查過程

1. **有沒有唯讀的方式先看正式環境目前的 auth 設定?**——查了 `supabase --help` 全部子指令,`config` 底下只有 `push`,沒有對應的 `pull`/`get`。`projects api-keys` 這類指令能用,證實 CLI 本身有有效的 Management API 憑證,但沒有暴露任何讀取或局部修改 auth 設定的介面。
2. **能不能直接用 Management API 繞過 CLI 的限制?**——查證 CLI 的憑證存在 Windows Credential Manager(`cmdkey /list` 看得到 `LegacyGeneric:target=Supabase CLI:supabase` 這個項目),但沒有把它挖出來做原始 API 呼叫——這已經是在迴避 CLI 刻意不開放的介面,不是在解決真正的技術障礙,判斷為不應該做。
3. **使用者同意「先修 site_url 再整份推送」後,推送前的最後檢查**——逐一看過 config.toml 的每個 section,發現 `[auth.external.google]`/`[auth.external.discord]` 的 secret 欄位用的是 `secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"` 這種語法——`config push` 執行當下會用執行環境的環境變數替換這個值。**檢查後確認我的執行環境完全沒有設定 `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`/`SUPABASE_AUTH_EXTERNAL_DISCORD_SECRET` 這兩個變數**。

## 結論:這不是「可能」風險,是「幾乎確定」會發生的風險

如果在沒有這兩個環境變數的情況下執行 `config push`,很可能會把正式環境的 Google/Discord OAuth secret 推成空值或未替換的字面字串——這會**直接讓全站的 Google/Discord 登入失效**,是比「不知道有沒有別的手動設定會被覆蓋」明確得多、後果嚴重得多的風險,而且沒有這兩個 secret 的實際值就無法先補上再推送。

回報給使用者後,使用者選擇**先停下,不推送**。SA-011 維持 ADR-0025 的原始狀態(Unable to Verify,本機 config 已知有問題但沒有安全的方式同步到正式環境)。

## 這次調查的價值

雖然最終結論跟 ADR-0025 一樣是「不動手」,但這輪的調查不是重複同一個結論——找到了一個原本沒有具體識別出來的真實風險點(OAuth secret 的 `env()` 替換語法),把「模糊的謹慎」變成「具體、可驗證的阻擋理由」。如果之後真的要處理 SA-011,正確的路徑是:使用者提供 Google/Discord OAuth client secret 的實際值(或直接在 Supabase dashboard 手動關閉 email signup、修正 site_url,完全不透過 `config push`),而不是繞過這些 secret 直接推送。
