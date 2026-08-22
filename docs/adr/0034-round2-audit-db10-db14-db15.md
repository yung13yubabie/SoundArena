# ADR-0034:第二輪稽核 P2/P3——DB-10(登入導轉遺失目的地)、DB-14(評分頁文案過度承諾)、DB-15(reportClientError 缺輸入邊界)

`/goal` 持續執行第二輪第三方稽核報告的下一階段,這批處理三個獨立、互不依賴的 P2/P3 項目。

## DB-10:middleware 層的登入導轉,把 query string 原樣搬到 /login,不是組成 `next` 參數

實測範圍比報告原本描述的更大。報告只舉 `/register` 為例,但 `web/src/lib/supabase/proxy.ts` 的 `AUTH_REQUIRED_PATHS`(`/register`、`/admin`、`/judge`、`/status`、`/feedback`、`/vote`)涵蓋的每一個路徑,未登入時都是這段 middleware 級的 redirect 先攔下,跑在頁面元件、以及 ADR-0024(SA-013)加的 `redirectToLogin()` 之前。也就是說,SA-013 那次修的頁面層 `next` 參數,對這份清單裡的路徑其實從未真正生效過——唯一真的會走到頁面層那份的只有 `/submit`(刻意不在清單裡,因為投稿頁允許先瀏覽再登入)。

原本的 middleware redirect 是直接 clone 整個 URL、只改 `pathname`,把原始 query string 原封不動搬到 `/login` 底下(例如 `/login?competition=ABC`)。但 `login/page.tsx` 只讀 `next` 參數,於是「使用者原本想去哪裡」這個資訊在這裡就丟失了——OAuth 流程走完之後永遠導回首頁,不是使用者原本想去的報名/投票/評分頁。

修法:`web/src/lib/supabase/proxy.ts` 的 redirect 區塊改成正確組出 `/login?next=<原始 path+search 的 URL 編碼>`,格式對齊 `loginRedirect.ts` 的 `safeNextPath()` 期待的形狀。頁面層既有的 `redirectToLogin()` 呼叫不移除——`register/page.tsx` 既有注解已經明確記載這是刻意的 defense-in-depth(Next.js 官方文件也建議 middleware 之外、路由本身也做一次檢查),對 `/submit` 這條不受 middleware 攔截的路徑,頁面層那份仍是唯一生效的路徑。

## DB-14:評分頁文案宣稱主辦人「完全看不到作者身份」,但同一個人在審核頁本來就看得到

`judge/page.tsx` 原本的說明文字寫「即使你是主辦本人」也看不到真實身份,但同一位主辦人(或有 `review` 權限的協作者)在 `/admin/review` 頁本來就需要核對真實 Suno 帳號才能審核投稿——這是 ADR-0020 設計上刻意保留的能力,不是漏洞。原文案把「評分工作台匿名」講成「主辦人整體上無法得知作者身份」,過度承諾。

修法:文案改成把匿名承諾精確限定在評分這個環節本身,同時明講「審核投稿」頁本來就需要核對真實身份,這個承諾不代表主辦人完全無法得知作者是誰。純文案修改,無程式邏輯變動。

## DB-15:`reportClientError()` 沒有任何輸入邊界

ADR-0028(SA-012)加的這支 Server Action 原本是 `(context, message) => console.error(...)`,沒有登入要求、沒有 context 白名單、沒有長度上限、沒有換行/控制字元過濾、沒有節流。報告點出:現狀風險不大(P3),但長期可能被當成免費的 log 灌水管道,把「讓錯誤進 server log」這個好意反過來變成 log spam 來源。

修法(`web/src/lib/clientErrorReport.ts`),對齊報告建議的五項:
- **authenticated only**:呼叫前先 `supabase.auth.getUser()`,拿不到使用者就直接 return,不記錄。
- **context 白名單**:只接受目前真的在用的 3 個呼叫點(`AdminShell.loadPlatformCompetitions`/`loadOrganizers`/`loadFeedback`),不在清單內的 context 直接忽略。
- **長度上限**:`message` 截到 1000 字元。
- **去除控制字元/換行**:防止有人塞偽造的多行假日誌混進真實 log。
- **節流**:記憶體內每人每分鐘最多 10 次,超過就靜默丟棄。不是正式 rate-limit 基礎設施(Vercel serverless 每個 instance 各自維護、重開就清空),但對「防濫用噪音」這個 P3 等級的需求已經足夠,沒有過度工程化。

## 驗證

`npx tsc --noEmit`(exit 0)、`npx eslint .`(0 errors,2 個既有無關 warning)、`npm run build`(成功,Proxy/Middleware 正常編譯進去)、`npm run test:security`(20/20 全數通過,確認這批修改沒有破壞任何既有安全邊界)。

DB-10 的實際生產環境驗證(未登入直接訪問 `/register?competition=X`,確認 redirect 的 `Location` header 變成 `/login?next=%2Fregister%3Fcompetition%3DX`)排入部署後的下一步。
