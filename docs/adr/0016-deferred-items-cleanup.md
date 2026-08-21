# 補完先前擱置的項目:通知內容架構、CSP nonce 化、CI + 分支保護

使用者要求把先前明確擱置、標成「之後再做」的項目補完,排除 Discord OAuth 重新設計跟實際設定 Resend/Discord 發信(這兩項仍需要使用者提供設定或先確認範圍)。

## 1. 通知事件內容改成伺服器端產生(ADR-0015 第 4 項的完整修法,原本的 blocker)

上一輪只做了低成本加固(event_type 白名單、長度上限、目標必須是真參賽者),`create_notification_event()` 本質上還是「信任呼叫端傳入的 title/body」。這輪做完整版:函式簽章從 `(p_user_id, p_competition_id, p_event_type, p_title, p_body)` 改成 `(p_user_id, p_competition_id, p_event_type, p_resource_id)`——呼叫端只給「發生了什麼事」跟「這件事對應哪一筆資料」,實際文案完全由這支 function 依 `event_type` 自己組出來,而且會重新驗證 `p_resource_id` 真的屬於 `p_user_id` + `p_competition_id`(不是只信任呼叫端說的對應關係)。呼叫端(`register/actions.ts`、`submit/actions.ts`)改成傳報名/投稿的 id,不再自己組字串。

用真實帳號驗證過:正常呼叫產生的內容跟預期文案一致;`resource_id` 對不上會被拒絕;未知 `event_type` 被拒絕;舊版簽章(帶 `p_title`/`p_body`)完全找不到對應的函式,PostgREST 直接回 404——呼叫端從此沒有任何路徑可以注入自訂文字內容。

## 2. CSP 從 `unsafe-inline` 改成 nonce-based(script-src)

讀了這個版本 Next.js 內建的 CSP 文件(`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`,依照 `web/AGENTS.md` 的指示,寫程式前先讀這份文件而不是憑訓練資料的舊版 Next.js 知識)。決定:

- `web/src/proxy.ts` 每個請求產生一次性 nonce,設進 `x-nonce` request header 跟 `Content-Security-Policy` response header——Next.js 會自動把這個 nonce 套用到它自己產生的 framework script、頁面 JS bundle 上,不需要手動逐一標記(這個 repo 本身也沒有任何 `<script>`/`dangerouslySetInnerHTML`,不用擔心遺漏)。
- `next.config.ts` 不再設定 CSP(nonce 只能逐請求產生,沒辦法寫死),改成只放不需要 nonce 的固定 header,同時補上 `Cross-Origin-Opener-Policy: same-origin-allow-popups` 跟 `Cross-Origin-Resource-Policy: same-origin`(這兩個是獨立複查報告點名缺少的)。
- **`style-src` 刻意沒有跟著 nonce 化,維持 `'unsafe-inline'`**——CSP 的 nonce/hash 機制不適用於 inline `style=""` 屬性(只適用於 `<style>` 區塊跟 `<link>`),而這個 repo 有真實在用的 inline style 屬性(`Avatar.tsx` 動態背景色、`VoteList.tsx` 播放中邊框色、`layout.tsx` 的字型 CSS 變數)。要做 style-src nonce 化,得把這幾處全部改寫成 CSS class,是額外的重構;CSS 注入本來就不能執行任意 JS,風險等級跟 script-src 不是同一個量級,優先把 script-src(真正能拿來執行攻擊者程式碼的向量)鎖緊。
- **nonce 只在動態渲染的頁面有效**——這個 repo 幾乎所有頁面本來就是動態渲染(`ƒ`),只有 `/login` 原本是純靜態(`"use client"` 元件,沒有任何 `await`)。已拆成 `LoginClient.tsx`(原本的內容)+ 新的 `page.tsx`(Server Component,用 `await connection()` 強制動態渲染)。`_not-found`/`icon.svg`/`opengraph-image` 維持靜態:後兩者是圖片產生路由,不是 HTML,CSP script-src 完全不適用;`_not-found` 沒有任何互動邏輯需要客戶端 JS(唯一的 `<Link>` 在 hydration 失敗時退化成一般 `<a>` 全頁刷新,不是功能性break,先接受這個已知的小限制)。

**驗證**:本機 `next build` + `next start` 起一個正式環境的 production server,用真實瀏覽器(claude-in-chrome)開首頁跟 `/login`,確認 response header 帶正確的 nonce 值、Next.js 自動把同一個 nonce 套到 preload 的字型/CSS 上(`Link` header 可以直接看到)、瀏覽器 console 沒有任何 CSP violation、首頁的篩選按鈕(client-side 互動)點擊後正確運作——確認不是「build 沒壞」表面上過關,是真的在瀏覽器裡測過會動。

## 3. 新增 CI(GitHub Actions)+ 啟用 main 分支保護

之前這整個 session 的驗證方式都是本機手動跑 `tsc`/`eslint`/`build` 再 push,repo 本身完全沒有 CI,`main` 也沒有任何分支保護(`gh api` 回 404 "Branch not protected")。新增 `.github/workflows/ci.yml`,在 push/PR 到 main 時自動跑 `tsc --noEmit`、`eslint`、`next build`(實測過 build 不需要任何環境變數就能成功,沒有洩漏風險)。

分支保護採用先前跟使用者確認過的範圍:禁止 force push、禁止刪除 main、要求 CI 這個 status check 通過才能合併,**不要求強制 PR review**——這個專案目前是使用者跟 Claude 兩人快速迭代、朋友測試階段,強制 PR review 的審核者還是同一批人,拖慢節奏但不會真的變更安全;真正有效的安全網是「build 沒過不能上」。

## 這輪仍然沒動的部分

- **Discord OAuth 兩段式重新設計**——使用者明確排除,需要之後再確認範圍。
- **實際設定 Resend/Discord 發信**——需要使用者提供 Resend API key、Discord Server ID,目前只是「寫入 notification_events 表,狀態停在 pending/skipped」,還沒有真的寄出去。
- **B2 孤兒檔案清理**——上傳功能本身還沒有任何使用者介面,沒有檔案可以孤兒化,等 B2 上傳 UI 做出來再一併處理。
