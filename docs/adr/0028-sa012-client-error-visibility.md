# ADR-0028:SA-012 觀測性——修掉真正看不到的那一半,誠實標記剩下需要外部服務的部分

按 `/goal` 處理審計報告最後一個項目。SA-012 原文要求「operator 在單一 dashboard 看得到錯誤、有 request/release context、P1 condition 可收到 alert」。這輪只做了其中一小塊,誠實記錄邊界在哪。

## 盤點:哪些錯誤本來就看得到、哪些完全看不到

`grep -rn "console.error" web/src` 找到 7 處,分兩類:

- **伺服器端**(`actionError.ts`、`api/cron/cleanup-audio/route.ts`、`admin/format/actions.ts`):Server Action / Route Handler 裡的 `console.error`,Vercel 本來就會自動捕捉進 function log——**這部分其實已經滿足「operator 在單一 dashboard 看得到」**,只是操作者可能不知道要去 Vercel dashboard 看,不是 code 沒做。
- **client component**(`AdminShell.tsx` 三處,platform competitions / organizers / feedback 讀取失敗):`"use client"` 元件裡的 `console.error` 只會出現在**觸發這個錯誤的那個使用者自己瀏覽器的 devtools**——PlatformAdmin(平台操作者)如果沒有剛好自己踩到,完全不會知道發生過。這才是真正的觀測性缺口,不是「沒有 log」,是「log 進了對的地方以外的地方」。

## 修法:把 client 端錯誤也送回伺服器端 log

新增 `web/src/lib/clientErrorReport.ts` 的 `reportClientError(context, message)` Server Action,`AdminShell.tsx` 三處 catch 分支在原本的 `console.error`(瀏覽器端,開發時還是有用)之外,fire-and-forget 呼叫這支 Server Action,把同一個錯誤也記到伺服器端——Vercel function log 會捕捉到,操作者才有機會在現有的 dashboard 發現。沒有另外建錯誤追蹤表、沒有專屬管理頁面,就是把「原本完全看不到」變成「至少進得了現有的 log」,故意保持最小範圍。

## 誠實記錄:這輪沒有解決、也解決不了的部分

- **主動 Alert(P1 condition 可收到通知)**:需要外部服務(Sentry/Datadog 之類)或是已經擱置的 Discord/Resend 整合——這兩條路都卡在需要使用者提供帳號/憑證,跟 SA-005 是同一個阻塞點,這輪沒有新增任何 workaround。
- **Cron 執行歷史的可見度**:Vercel Cron 本身在 dashboard 有執行紀錄(成功/失敗、執行時間),這是 Vercel 平台原生功能,不需要額外開發——但這次沒有實際登入 Vercel dashboard 確認畫面長相,只依據 Vercel 官方文件的描述,標記為「應該已經有,未實際核實」。
- **完整的 request/release context**(哪個版本、哪個 request 出的錯):目前的 `console.error` 呼叫沒有系統性帶上 release/commit hash 或 request ID,只有 Vercel 平台原生附加的 metadata(如果有的話)。要做到審計報告原文要求的完整度,需要額外的 structured logging 規範,這輪沒有展開。

## 驗證

`tsc`/`eslint`/`build` 全程乾淨。`reportClientError()` 本身是純粹的 fire-and-forget 記錄動作,沒有權限/資料完整性邏輯,不是這個 session PoC 紀律鎖定的「安全邊界」類型改動,用直接呼叫確認函式執行不拋錯、正確印出訊息即可,沒有另外寫完整的多帳號 PoC。
