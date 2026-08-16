# HANDOFF — 聲擂 SoundArena

> 寫給完全沒有上一輪對話記憶的新 session 看。這份文件是唯一的真相來源,不要假設你「應該知道」任何背景。
> 寫入時間:2026-08-16(對話跨了 08-09 ~ 08-16 多天,以下依實際完成順序整理,不是猜測;本次更新加在文件尾端「08-16 晚間追加」段落,前面內容原樣保留)

---

## Git 狀態(08-16 已解決,新 session 不用重查)

SoundArena 現在有**自己獨立的 git repo**(`SoundArena/.git`,跟上層 `C:\Users\LIN\Documents\github` 那個沒有任何關係——那個上層 repo 是空的、zero commits,而且底下混了 `SUNOprompt`/`backend`/`lottery` 幾個不相關的專案資料夾,SoundArena 不用它)。

第一個 commit(`f604235`)已建立,涵蓋 08-09 ~ 08-16 累積的所有工作。**已設定遠端**:`https://github.com/yung13yubabie/SoundArena`(public),README.md 有專案說明 + 4 張真實畫面截圖。

踩過的坑,別再犯:`web/` 之前有它自己的巢狀 `.git`(`create-next-app` 自動產生,只有一個沒有價值的初始 commit),導致 `git add` 把整個 `web/` 當成內嵌 repo(gitlink)處理、內容完全沒被追蹤到。已經刪掉那個巢狀 `.git`,`web/` 現在是 SoundArena repo 底下的普通資料夾。**如果之後又看到 `git add` 跳出「adding embedded git repository」的警告,表示某個子資料夾又長出了自己的 `.git`,要先處理掉才能繼續。**

---

## 這是什麼專案

「聲擂 SoundArena」——音樂比賽投票網站。核心玩法:AI 音樂平台(以 Suno 為主)創作者投稿、多輪賽制淘汰、匿名投票、LINE bot / Discord bot 發通知。

**專案定位在 08-11 那輪對話裡發生過一次重大轉向**:原本假設是「站方自己主辦比賽」,後來實測競品(songcontest.ai)發現同類產品是開放平台,經 grill-me 訪談確認後,SoundArena 改成**開放多租戶平台**——任何登入使用者都能自由建立比賽並成為該場的 Organizer。細節見 `docs/adr/0002-open-multi-tenant-platform.md`。

---

## 檔案地圖(先讀這些,不要重新摸索)

```
C:\Users\LIN\Documents\github\SoundArena\
├── HANDOFF.md                      ← 你正在讀的這份
├── SPEC.md                         ← 完整規格,第 0~10 節 + 附錄,唯一真相來源
├── CONTEXT.md                      ← 領域詞彙定義,只放詞彙不放實作
├── docs/adr/
│   ├── 0001-format-and-scoring-attach-to-round.md
│   └── 0002-open-multi-tenant-platform.md
├── design/
│   ├── prototype.html              ← huashu-design HTML 原型(參考用,11 個畫面已全數搬進 web/)
│   └── screenshots/                ← 舊驗證截圖,可忽略
├── supabase/
│   ├── config.toml                 ← 已 link 到雲端專案 xmcesnfcrqzjuystfcil,含 Google/Discord provider 設定
│   └── migrations/20260816010347_init_schema.sql  ← 完整 Postgres schema(見下方)
└── web/                            ← Next.js 16 + TypeScript + Tailwind v4,真正在跑的網站
    ├── src/app/                    ← 11 個路由,全部是真的畫面(見下方)
    ├── src/components/             ← SiteHeader、AdminShell、PlayerBar、EmptyState、ReportButton、Switch、LogoutButton
    ├── src/lib/supabase/           ← client.ts(瀏覽器)、server.ts(Server Component/Route Handler)、proxy.ts(session 刷新+登入 gate)
    ├── src/lib/mockData.ts         ← 管理後台系列頁面共用的假資料(FORMAT_BLOCKS、MOCK_COMPETITION 等)
    ├── src/proxy.ts                ← Next.js 16 用 proxy.ts 不是 middleware.ts(已改名,見下方踩坑記錄)
    └── .env.local                  ← Supabase URL/anon key/service_role key、Discord bot token(已被 .gitignore 排除)
```

**讀規格的順序**:SPEC.md 第 0 節(平台定位)→ CONTEXT.md(詞彙)→ 需要哪個功能再讀 SPEC.md 對應節次。

---

## 已完成的東西(依實際發生順序)

### 規格與設計(SPEC.md / CONTEXT.md,已定案不是草稿)

1. **grill-me 訪談定案完整規格**:帳號登入(Google/LINE/Discord OAuth)、報名投稿流程、Suno 連結身份驗證、播放架構(自架私有儲存+短效簽章網址)、匿名投票三種模式、賽制積木系統、評分機制(加權100%+額外加分)、通知系統(涵蓋整場比賽生命週期,見第 6 節)、UI 設計方向。
2. **domain-modeling 核心實體**(CONTEXT.md):Competition / Round / FormatBlock / FormatTemplate / ScoringRule / ScoreItem / Participant / ParticipantStatus / Submission(含完整狀態機)/ AnonymityMode / SchedulePhase / Registration / Organizer / PlatformAdmin / Report。
3. **開放多租戶平台定案**(ADR-0002):任何登入使用者可自由建立比賽成為 Organizer;PlatformAdmin 是全站層級、手動指派;Report 檢舉機制;首頁是不需登入的 Discovery。

### Supabase 後端(08-16 這輪從零建起)

- **專案**:`xmcesnfcrqzjuystfcil`(ap-southeast-1),Supabase CLI 已裝好(透過 Scoop)、已 `supabase link`。
- **Postgres schema**(`supabase/migrations/20260816010347_init_schema.sql`)已 push 上雲端並用 REST API 驗證過:CONTEXT.md 全部實體 + votes/submission_scores(算分機制需要,CONTEXT.md 沒明講但必要)。
  - 加權計分項目權重總和=100% 是資料庫層級的 deferred constraint trigger,不只是前端檢查——**同一個 ScoringRule 底下的多個加權項目要在同一次交易裡一起送出**,分開存會各自觸發檢查失敗。
  - RLS 全部開啟。只有低風險的部分寫了 policy(公開目錄表、使用者自己的 profile、Organizer 管自己的比賽/賽制)。**registrations / submissions / votes / submission_scores / reports 這五張表刻意留白,只有 service_role 能寫**——涉及「評審不應看到投稿者真實身份」「匿名揭露時機」這些規則,值得之後獨立設計,不是這輪順手猜。
  - `format_templates` 表建了但沒塞資料(SPEC 只舉例沒給精確組合)。
  - SchedulePhase 沒有獨立表,併進 `competitions`(報名窗口)跟 `rounds`(投稿/投票窗口)的時間欄位。
  - 通知系統(SPEC 第 6 節)還沒有 schema——CONTEXT.md 沒定義這個實體,而且需求本身在這輪對話裡才補完整(見下)。
- **Auth**:Google 跟 Discord 都是真的、可登入,已用真實帳號(linpcw@gmail.com)實測過整條鏈(登入→session→`/register` 頁 gate 生效→登出→gate 重新擋下)。**LINE 使用者暫時申請不到,先擱置**,SPEC.md 裡 LINE 的技術規格都還留著沒刪。
  - Google:Supabase 內建 provider,scope `openid email profile`。
  - Discord:Supabase 內建 provider,scope `identify guilds.join`;`guilds.join` 的實際「拉進伺服器」動作要在後端呼叫 Discord API,用到 `session.provider_token`(**只在登入當下那次 session 物件裡出現,Supabase 不存進資料庫,要當下用掉**)+ Bot Token(絕對不能進前端)。程式碼已寫好(`web/src/app/auth/callback/route.ts` 的 `joinDiscordGuild()`),但 **`DISCORD_GUILD_ID` 還是空的**(`.env.local` 裡有這個欄位待填)——要等使用者把 Bot 邀進 SoundArena 的 Discord 伺服器、給伺服器 ID,這段邏輯才會真的執行,現在是安全的 no-op。
  - Google OAuth 同意畫面會顯示 `xmcesnfcrqzjuystfcil.supabase.co` 而不是「SoundArena」——**這是 Supabase 的已知限制**(Google 預設顯示 callback 網域,不是 App name),要換掉只能走 Google 品牌驗證或自訂網域(通常要 Supabase Pro),現在不急著處理。
  - Discord 的 App 名稱是在 Discord Developer Portal 自己取的,跟上面那條完全無關,想改隨時去 Portal 改,不用送審。
  - Google/Discord 的 Client ID/Secret 只存在 Supabase 的 provider 設定裡(`supabase/config.toml` 的 `[auth.external.*]`,secret 用 `env()` 佔位符,不進版控),**不需要**也沒有存進 `web/.env.local`——前端從頭到尾不需要這兩組值,是 Supabase 自己處理 OAuth。
- **Cloudflare R2**:已決定用它存音檔(`audio_object_key` 欄位存物件路徑,storage-agnostic,不需要因為選 R2 回頭改 schema),但 bucket 還沒建、金鑰還沒拿。

### Vercel 部署(08-16 這輪設好的,已上線)

- Vercel CLI 已裝(`npm install -g vercel`,跟 Supabase CLI 不一樣,這個沒有 Windows npm 棄用問題),已登入、已 `vercel link`。
- Project:`galaxyus-projects/web`(team `galaxyus-projects`,project 名稱是 `web`,沿用資料夾名稱,沒特別改)。
- **正式網址(穩定,每次 `vercel deploy --prod` 都指向這個)**:`https://web-mocha-xi-12.vercel.app` —— 已用真實帳號實測整條登入鏈,跟本機一樣通。
- 環境變數(`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`DISCORD_BOT_TOKEN`)已用 `vercel env add --value ... --yes` 設進 Production 環境。**`DISCORD_GUILD_ID` 還沒設**(本地也還沒填,見上)。
- Supabase 的 `additional_redirect_urls` 已加上 `https://web-mocha-xi-12.vercel.app/**` 跟 `https://web-*-galaxyus-projects.vercel.app/**`(涵蓋這個 team/project 底下所有 preview deploy 網址,沒有開放到任意 `*.vercel.app`,範圍有收斂)。
- **要重新部署**:`cd web && vercel deploy --prod`。**改了環境變數要重新部署才會生效**(Vercel 是 build-time 注入)。

### Next.js 真實骨架(`web/`)

真的能動、不是佔位頁的路由:
- `/login`、`/register` — 真的接 Supabase Auth,`/register` 有 Server Component 層的登入 gate(未登入會被 `src/proxy.ts` 導回登入頁)
- `/`(Discovery)、`/competitions`(擂台+播放器)、`/submit`(投稿表單)、`/vote`(投票)、`/judge`(評審評分)、`/status`(個人狀態)、`/admin/review`(審核後台)、`/admin/format`(賽制建立)、`/admin/schedule`(時程設定)— 全部從 `design/prototype.html` 忠實搬過來,用 Tailwind 重寫
- `/updates`(公開更新記錄)、`/feedback`(意見回饋,登入才能寫)— 08-16 這輪新加的功能,不在原本 SPEC 裡,是對話中臨時加的需求
- **導覽**:`SiteHeader` 的 nav 曾經只有 3 個項目(活動/比賽/上傳作品),`/vote`/`/judge`/`/status`/`/admin/*` 完全沒有入口只能打網址進去——已擴到 7 個項目全部涵蓋,見 `src/components/SiteHeader.tsx` 的 `NAV_ITEMS`(目前是「全部攤平顯示」,還沒有依角色收合,見下方缺口 2)

**已經接上真實 Supabase 資料的部分**(不是假資料了):
- **`/admin/format`(建立比賽)**:Organizer 沒有比賽時顯示建立表單,送出後真的 INSERT `competitions` + 初賽/決賽兩輪 `rounds` + 預設 `scoring_rules`(投票40/影片流量25/外部投票35,總和100%)。建立後畫面讀真實資料,賽制積木 chip、新增/移除輪次、ScoringRuleOverride 開關、計分項目權重編輯,全部透過 `src/app/admin/format/actions.ts` 的 Server Actions 寫回資料庫。程式碼在 `page.tsx`(Server Component 抓資料)+ `AdminFormatClient.tsx`(互動邏輯)+ `CreateCompetitionForm.tsx`。
- **`/admin/schedule`**:讀寫 `competitions` 的宣傳/公布/報名截止日 + 所有 `rounds` 的投稿/投票日期(目前是套用到「每一輪」,還沒做到每輪各自不同投稿窗口,那是 SPEC 第2節「僅開放特定輪次投稿」的獨立功能)。
- **Discovery(`/`)**:讀真實的公開比賽(`is_public = true`),狀態徽章(報名中/已截止/籌備中)是從 `registration_closes_at` 真實算出來的,不是假資料。主辦方名稱透過新的 profiles RLS policy 讀真實 `display_name`。
- **feedback/changelog**:兩張新表,不在 CONTEXT.md 原本的實體清單裡。`feedback` 只能寫不能讀(RLS 只開 insert,審閱走 Supabase dashboard 或 service_role);`changelog_entries` 任何人都能讀,只有 service_role 能寫(目前一筆真實紀錄:「Google / Discord 登入上線」)。

**這輪測試時抓到、已修正的真實 bug(不是憑空猜的,每個都是實測炸掉才發現)**:
1. `profiles` 的「PlatformAdmin 可讀」RLS policy 在自己的判斷條件裡查詢 `profiles` 表本身 → **infinite recursion**,擋住任何「寫入後讀回」的操作(包括建立比賽這個最基本的動作)。修法是 `is_platform_admin()` 這個 `SECURITY DEFINER` function(見 `20260816100724_fix_profiles_rls_recursion.sql`),同樣的複製貼上錯誤在另外 5 條 policy 裡也存在,一起修了。
2. `AdminFormatClient` 一開始還在用 `mockData.ts` 的 `FORMAT_BLOCKS`(key 像 `single-elim`)當賽制積木選單,但資料庫真正 seed 的 key 是 `single_elimination`——兩邊對不上,點擊賽制積木會靜默失敗(找不到積木、悄悄不寫入,UI 上看起來像選中其實只是滑鼠 hover 的錯覺)。現在積木選單改成從 `format_blocks` 表即時查詢,不會再跟資料庫脫鉤。
3. 加權計分項目權重總和=100% 的檢查是 deferred constraint trigger,一次交易內要看到最終狀態——用 PostgREST 個別 UPDATE/DELETE 每筆都會各自觸發、各自可能失敗。解法是 `replace_score_items` 這個 Postgres function(見 `20260816095858_score_items_replace_fn.sql`),把整批異動包在同一個交易裡。
4. `<input type="date">` 空著時送出的是 `""`,不是 `null`——Postgres 的 `timestamptz` 不接受空字串,會報 `invalid input syntax`。`saveSchedule` 現在會把空字串轉成 `null` 再送出。

**已知缺口,不是漏了、是還沒排到**:
1. **投票/評分兩張表還是空的**:`votes` / `submission_scores`(連同 `/vote`、`/judge` 兩個畫面)還是 mock 資料,RLS 也刻意留白。**`registrations` / `submissions` 已經在 08-16 晚間那輪接上真實資料**,見文件尾端「08-16 晚間追加」段落——「報名 → 投稿 → 審核」這條線已經做完並實測過,下一條自然的線是「投票 → 評分」。
2. **`/admin/*` 的權限保護只到「有沒有登入」**,proxy.ts 沒有檢查「這個人是不是這場比賽的 Organizer」——目前是靠 RLS 擋(別人的比賽你查不到、改不了),但 UI 層面任何登入使用者都能打開 `/admin/format` 看到「建立你的第一場比賽」表單。等有多個 Organizer 的真實情境出現,要重新檢視這塊。
3. **通知系統完全沒動**——SPEC 第 6 節已經把觸發時機寫完整,也決定加 Email 管道(只有 Google 登入的人能收)——但沒有 schema、沒有寄信服務商。

### 已驗證的技術事實(不要重新查一次,直接信,除非官方又改版)

- `GET https://studio-api-prod.suno.com/api/share/code/{分享碼}`:公開、免登入,**但只能從伺服器呼叫,瀏覽器直接呼叫會被 CORS 擋**。
- Suno 分享連結兩種等價格式都要認:`suno.com/s/{code}` 跟 `suno.com/song/{uuid}?sh={code}`。
- Suno 沒有公開 Developer API/OAuth。
- Suno CDN 有未加簽章、永久有效的直連音檔網址,但**不採用**這個當播放來源。
- Supabase Auth **沒有內建 LINE provider**(內建清單:Apple/Azure/Bitbucket/Discord/Facebook/Figma/GitHub/GitLab/Google/Kakao/Keycloak/LinkedIn/Notion/Slack/Spotify/Twitch/Twitter/WorkOS/Zoom),要接 LINE 得走 Supabase 的 Custom OIDC Provider,LINE 的 OIDC issuer 是 `https://access.line.me`,provider identifier 建議 `custom:line`。
- Supabase `additional_redirect_urls` 是**萬用字元比對**,不是精確比對(config.toml 裡的註解寫「exact」是舊/不精確的說法)——要涵蓋 `/auth/callback` 這類子路徑,必須寫 `http://localhost:3000/**`,只寫 `http://localhost:3000` 不會匹配到子路徑,登入會悄悄退回用 `site_url` 當備援、code 卡在網址列沒被消化。
- Next.js 16 把 `middleware.ts`/`export function middleware` **改名**成 `proxy.ts`/`export function proxy`,寫法完全一樣只是檔名跟 export 名稱換了;Vercel 官方的 Supabase 範例已經同步改用新名字,可信。

---

## 下一步(哪個先做,使用者可以自己選)

1. **接下一段真實資料:投票 → 評分**。「報名 → 投稿 → 審核」這條線已經做完並實測過(見文件尾端「08-16 晚間追加」),`/vote`、`/judge` 還是 mock。每接一塊都要照這輪的模式:寫 Server Action → build → 真的在瀏覽器點過 → 用 service_role 查資料庫驗證,不要只看畫面渲染就當作成功。
2. **Discord guilds.join 補完**:使用者把 Bot 邀進 SoundArena Discord 伺服器,把伺服器 ID 填進 `.env.local` 跟 Vercel 的 `DISCORD_GUILD_ID`
3. **`/admin/*` 的角色級權限保護**:proxy.ts 目前只檢查「有沒有登入」,沒檢查「這個人是不是這場比賽的 Organizer」——RLS 是實際擋著的那層,08-16 晚間那輪加了 UI 層的競賽切換器(只列自己的比賽)跟主辦身分設定閘門,但 route 層級的角色檢查還是沒做,見上方已知缺口 2
4. **Cloudflare R2**:建 bucket、拿金鑰、接上音檔上傳/簽章下載
5. **通知系統**:schema 還沒建,但訂閱範圍的鐵律已經定案並寫進 SPEC.md 第 6 節——**報名才會訂閱,單純建立/主辦比賽不會訂閱,訂閱可取消**,實作時直接照這條規則設計 schema,不用重新討論範圍。
6. **LINE 登入**:使用者能申請的時候回來補
7. **以下兩項使用者提過、明確要做但還沒排進去的功能,下次要問使用者要先做哪個**(主辦者履歷頁已在 08-16 晚間那輪做完,見文件尾端):
   - **FormatBlock 的 `config` 具體設定 UI**:選中賽制積木後目前只是勾選,`format_blocks`/`round_format_blocks` 已有 `config` jsonb 欄位但沒有對應的設定畫面(例如主題輪要填關鍵字/曲風)——範圍還沒訂。
   - **邀請連結整合模板訊息**:主辦分享比賽連結時,希望能帶出整合賽制/投票資訊的訊息模板,並支援 `{變數}` 填入——範圍還沒訂(模板存哪裡、哪些變數、UI 長怎樣都待設計)。

---

## 踩過的坑,新 session 絕對不要再踩

1. **`ICONS.x` 沒定義會靜默失敗,不會報錯**——`web/src/lib/icons.tsx` 是型別安全寫法,打錯字 TypeScript 會直接報錯,但**新增 icon 名字一樣要記得先加進 `ICONS` 物件**。

2. **Suno API 不能從瀏覽器直接呼叫**——CORS 會擋,已經實測證明。SPEC.md 第 2 節已經寫死這條規則。

3. **`C:\Users\LIN\Documents\github` 這個上層資料夾曾經有 `dubious ownership` 問題**——已經解決(使用者跑過 `git config --global --add safe.directory`),但**這個 repo 至今 zero commits**,見文件最開頭那條。

4. **Supabase CLI 在 Windows 用 Scoop 裝,不要 `npm install -g supabase`**——已裝好,不用重裝。

5. **Supabase `config push` 會整份 `[auth]` 設定一起同步,不是只改你想改的那幾行**——這輪推 Google/Discord provider 設定時,連帶把 MFA 註冊選項、email OTP 長度等不相關設定也覆蓋成 `config.toml` 本機的預設值。這輪影響不大(反正沒在用密碼登入/MFA),但下次要推設定前,**先看 `supabase config push` 印出的 diff 有沒有意外改到不該動的東西**,不要只看你自己加的那幾行。

6. **Supabase `additional_redirect_urls` 要用萬用字元 `/**`**,還有 **Next.js 16 是 `proxy.ts` 不是 `middleware.ts`**——都寫在上面「已驗證的技術事實」,別重踩。

7. **瀏覽器裝了翻譯/擴充套件時,本地開發可能跳出 hydration 錯誤覆蓋層擋住整個畫面**——`web/src/app/layout.tsx` 的 `<html>` 已加 `suppressHydrationWarning`(React/Next.js 官方對這個情境的建議寫法),遇到類似狀況先確認是不是瀏覽器擴充套件在搞鬼,不是自己程式碼的 hydration bug。

8. **每個 session 第一次呼叫 Bash 工具前,GateGuard 的 fact-forcing hook 會擋下來**,要求先用文字講清楚「使用者請求是什麼(一句話)」+「這個指令要驗證/產生什麼」。

9. **這個 session 一開始還審查過一個完全不相關的 GitHub repo**(`zhaoxuya520/reverse-skill`,藏了 prompt injection 框架)——跟 SoundArena 專案完全無關,只是同一個對話串的歷史紀錄,不用理會。

10. **寫 RLS policy 時,絕對不要在某張表的 policy 條件裡查詢那張表自己**(即使是透過別名 `p`)——會觸發 infinite recursion,而且是複製貼上就會一路複製這個錯誤的那種 bug(這輪一次踩了 6 個 policy)。要檢查角色權限(如 `is_platform_admin`),寫一個 `SECURITY DEFINER` 的 helper function 繞過 RLS 去查,不要用行內 subquery。

11. **前端拿來畫選單/按鈕的資料,如果資料庫已經有對應的真實資料表,不要繼續用寫死的 mock 常數**——這輪 `AdminFormatClient` 忘記把 `FORMAT_BLOCKS` 從 mockData.ts 換成真的資料庫查詢,兩邊 key 對不上,點擊會靜默失敗還看不出來(UI 上誤以為選中,其實只是滑鼠 hover 效果)。串接真實資料時,搜一次 `mockData` 的 import,確認每個都真的換掉了。

12. **`<input type="date">` 空著送出的是 `""` 不是 `null`**,直接塞進 `timestamptz` 欄位會被 Postgres 拒絕(`invalid input syntax`)。串資料庫前先把空字串轉 `null`。

13. **用瀏覽器自動化工具對原生 `<input type="date">` 打字容易出亂子**(年份欄位會不正常累加數字,變成 `90120/02/06` 這種畸形值)——這是 date picker widget 跟自動化按鍵模擬互動的已知怪癖,不是程式碼的 bug。要測試就跳過鍵盤模擬,直接用 JS 呼叫原生 setter 設值再觸發 `input` 事件:
    ```js
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inputEl, '2026-09-01');
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    ```

14. **Session 過期比想像中頻繁**(這輪跳出好幾次),`/auth/callback` 沒問題但要重新走一次 Google 帳號選擇畫面——如果瀏覽器已經對這個 App 授權過,選帳號後會直接跳過同意畫面。

---

## 使用者的協作偏好

- 有時會明講「不需要太多說明,只要簡單的」——收到這種訊號後,回覆盡量精簡。
- 偏好「先做完再回報」,不要每一步都停下來問,但**架構級的分岔決定**(平台定位、前端部署平台、音檔儲存廠商)一定要讓使用者自己選。這輪用 `AskUserQuestion` 問過:前端部署選 Vercel、音檔儲存選 Cloudflare R2、Email 管道先記需求不急著接。
- 對「靜默失敗」「空集合沒設計」特別敏感,SPEC.md 第 10 節已經寫成硬性規則。
- 喜歡追根究底查證技術限制,不接受用猜的回答——這輪查證過 Supabase LINE provider 是否存在、Google OAuth 同意畫面顯示網域的真正原因,都是先查證再回答,不是憑印象。
- 輸入常常很精簡/口語(例如「UIUX似乎還沒從本地搬運過來喔 完成他!」),需要自己判斷完整範圍再動手,不要照字面窄義解讀。
- 過程中會直接否決或修正我的建議、要求照他的方向做,正常收下,不用堅持己見。

---

## 08-16 晚間追加:報名 → 投稿 → 審核這條線做完了

### 這輪做了什麼

- **`registrations` / `submissions` 兩張表接上真實 RLS**(`supabase/migrations/20260816104605_registrations_submissions_rls.sql`):自己可以 insert/select 自己的報名跟投稿,比賽的 Organizer 可以 select/update 自己比賽底下的所有報名跟投稿(透過 `rounds`→`competitions` 兩層 join 到 `organizer_id`)。`registrations` 新增 `display_name text not null` 欄位(舊資料用 drop-default pattern 補值)。
- **`/register`**:沒帶 `?competition=` 參數時列出所有公開比賽當選單;帶了參數就查該場比賽,檢查是否已報名、報名是否已截止,真的 insert 進 `registrations`。重複報名會被 `23505` unique constraint 擋下,轉成「你已經報名過這場比賽了」的訊息。
- **`/submit`**:查使用者「已報名且該輪開放投稿且還沒投過」的組合當選單,真的 insert 進 `submissions`(status 直接是 `pending_review`)。Suno 分享連結解析出的 handle 會跟該筆報名真正的 `suno_handle` 動態比對,不是寫死的 true/false。
- **`/status`**:改成查真實 `registrations` + `rounds` + `submissions`,依比賽分組顯示每輪的投稿狀態徽章;被淘汰的比賽會顯示淘汰輪次橫幅。
- **`/admin/review`**:查 Organizer 名下所有比賽的待審投稿,身份比對(`sharer_handle` vs `registrations.suno_handle`)即時算出,新增「通過/退回/人工放行」三個 Server Action 按鈕(`web/src/app/admin/review/actions.ts` 的 `reviewSubmission`)。
- **Discovery(`/`)**:每張比賽卡片加上「查看並報名 →」連結,直接帶 `?competition=<id>` 進 `/register`。

**端到端實測過(不是只看畫面),流程:Discovery → 報名 → 投稿 → 個人狀態頁 → 審核後台核准,每一步都用 service_role 查過資料庫確認寫入,不是只看 UI 渲染**。已 commit(`ef77d3e`)、push、`vercel deploy --prod` 重新部署上線(`https://web-mocha-xi-12.vercel.app`)。

### 這輪修的 bug

1. **`<select>` 下拉選單灰底白字**:`<option>` 彈出清單是作業系統原生渲染,不吃網頁 CSS 背景色——修法是在父層 `<select>` 加 `[color-scheme:dark]`,不是 Tailwind 打錯字(這輪一度誤判成打錯字,Read 工具核對原始檔案內容後自我更正,`bg-black/25` 本來就是對的,是 Grep 顯示層把斜線畫成反斜線的視覺假象)。四個 select 都補上了:`submit/SubmitForm.tsx`、`admin/format/CreateCompetitionForm.tsx`、`admin/format/AdminFormatClient.tsx`(兩處)。
2. **瀏覽器自動化打中文字時偶發觸發瀏覽器導覽快捷鍵**——測試填報名表單暱稱欄位時,網址中途無預警跳掉。跟第 13 條 date input 那個坑同一類,解法一樣:繞過鍵盤模擬,直接用 JS 呼叫原生 setter 設值再 dispatch `input` 事件。
3. **合成 `blur` 事件不會觸發 React 的 `onBlur`**——用 JS 設完 Suno 網址的值、手動 dispatch `blur` 事件後,畫面沒有跑身份比對(靠 `onBlur` 觸發)。改用真的滑鼠點擊該欄位、再點別處,React 才正常收到 blur。

### 澄清:Supabase 跟 Cloudflare R2 不是誰輔助誰的關係

使用者一度誤會「Supabase 存音檔、R2 是輔助角色」。實際架構是**平行分工,不是主從**:Supabase 只存結構化資料(帳號、比賽、報名、投稿的 metadata……),音檔完全不會進 Supabase;R2 專門存音檔二進位檔案本身(`submissions.audio_object_key` 存的是 R2 物件路徑字串)。Supabase 的免費額度是資料庫用量,不會因為音檔而爆——因為音檔從頭到尾就不會經過 Supabase。R2 目前還沒建 bucket,見「下一步」第 4 項。

### 通知訂閱範圍鐵律(已寫進 SPEC.md 第 6 節,schema 還沒做)

使用者明確定調:**報名(Registration)才是唯一的訂閱觸發點**,單純建立/主辦比賽不會訂閱那場比賽的通知(不然每個 Organizer 一辦比賽就被轟炸)。訂閱可以主動取消。通知管道(Email/Discord/LINE)由登入方式決定收不收得到,但「要不要收」這件事的範圍還是綁在「報名了哪些比賽」。下次做通知系統時直接照這條設計 schema,不用重新跟使用者確認範圍。

---

## 08-16 晚間第二輪追加:主辦人身分檔案、比賽切換器、審核理由、參加者公開檔案

### 這輪做了什麼

- **主辦人「主持人身分」檔案**:`profiles` 新增 `bio`/`social_link`/`featured_track_url`/`host_setup_completed` 欄位。`/admin/profile`(`ProfileForm.tsx`)讓 Organizer 填簡介、社群連結、一首推薦曲目(YouTube 連結,`web/src/lib/youtube.ts` 解析各種網址格式轉成 embed URL)。**`/admin/format`/`/admin/schedule`/`/admin/review` 三頁現在會檢查 `host_setup_completed`,沒設定過會先導去 `/admin/profile`**,存檔後才放行——這是使用者這輪明確要求的「才可以看」。
- **公開個人檔案頁 `/u/[id]`**:任何人(含未登入)都能看,顯示:大頭貼(有 `avatar_url` 就用圖,沒有就跟 Gmail 一樣顯示姓名前兩碼,`web/src/lib/avatar.ts` + `components/Avatar.tsx`)、簡介、社群連結、YouTube 推薦曲嵌入播放、主辦過的公開比賽清單、使用者自己標記公開的參賽紀錄(名次功能還沒做,因為投票/評分系統本身還沒建,先顯示「名次功能開發中」佔位)、使用者自己標記公開且審核通過的投稿作品(**刻意排除退回的投稿**,不然使用者的公開履歷會被自己審核沒過的作品拉低)。Discovery 卡片的主辦人名稱現在會連到這頁。
- **管理後台比賽切換器 + 側欄導覽修復**:這輪動工時才發現 `AdminShell` 的側欄按鈕(審核後台/賽制建立/時程設定)**只改本地 state,從來沒有真的導頁**——三個畫面各自是獨立路由,點側欄完全沒反應,靠使用者自己打網址切換。連帶發現 `/admin/format`、`/admin/schedule` 一直是「抓 Organizer 最新建立的那一場比賽」(`order by created_at desc limit 1`),Organizer 若辦了不只一場比賽,舊的那幾場完全打不開、連清單都沒有。兩個一起修了:側欄改成真的 `<Link>` 導頁,並在側欄加一個「管理中的比賽」下拉選單(`?c=<competitionId>` 決定當前管理哪一場,三個管理頁 + `AdminShell` 都吃這個參數)。這正好對應使用者這輪要的「只能看自己舉辦的[比賽],且要先選」。
- **審核退回理由**:`submissions` 新增 `review_note` 欄位。`/admin/review` 點「退回」現在會展開一個原因輸入框(不是瀏覽器原生 `prompt()`,因為那種對話框會擋住自動化測試工具,也不是好的真實使用者體驗),存進 `review_note`,`/status` 頁在該輪次下方顯示「退回原因:xxx」給投稿者看。
- **`/status` 顯示具體投稿內容**:原本每輪只有一個狀態徽章,現在同時顯示投稿標題、「在 Suno 上查看」連結,退回時額外顯示退回原因。
- **參加者隱私設定**:`registrations` 新增 `is_public` 欄位(語意跟已存在的 `submissions.allow_public_playback` 一致,都是「這筆紀錄要不要出現在我的公開檔案」)。`/status` 頁底部新增「隱私設定」區塊(`PrivacyPanel.tsx`),逐筆報名紀錄、逐筆投稿都能個別開關,也有「全部公開/全部私密」一鍵切換按鈕(對應使用者原話「可個別公開也可全公開」)。切換走 `set_registration_public`/`set_submission_public` 兩個 `SECURITY DEFINER` function(`web/src/app/status/actions.ts`),函式內部用 `where user_id = auth.uid()` 鎖定只能改自己的資料——**沒有開放一般的 self-update RLS policy**,因為 `registrations` 還有 `status`/`eliminated_in_round_id` 這種只該由 Organizer 改的欄位,開放整列 self-update 等於讓參賽者能自己把自己從「已淘汰」改回「active」。

**端到端實測過(不是只看畫面)**:主辦人檔案填寫→儲存→用 service_role 查 DB 確認四個欄位都寫入;側欄導覽點擊確認真的換路由(之前完全沒反應);審核退回填理由→確認 `review_note` 寫入且 `/status` 正確顯示;隱私開關切換→用 service_role 查 DB 確認 `is_public`/`allow_public_playback` 真的翻轉;公開檔案頁確認退回的投稿不會出現、只有審核通過且標記公開的才會出現。已 commit(`93d572f`)、push、`vercel deploy --prod` 重新部署上線。

### 這輪抓到的安全問題(不是這輪引入的,是做這輪功能時順手查出來的既有缺口)

1. **`profiles updatable by self` 這條 RLS 沒有限制欄位**——RLS 是列級權限,不是欄級。這條 policy 的 USING/CHECK 都只驗證 `auth.uid() = id`(這一列是不是你自己的),完全沒管「你能改哪些欄位」。實際後果:任何登入使用者理論上可以直接呼叫 `PATCH /rest/v1/profiles?id=eq.<自己的id>` 帶 `{"is_platform_admin": true}`,RLS 會放行(因為那確實是他自己的 row),直接自我提權成平台管理員。目前沒有任何程式碼會這樣寫,純粹是設計疏漏。
2. **`profiles readable when organizing a public competition` 開放整列可讀**——這條 policy 原本是為了讓 Discovery 頁顯示主辦人名稱,但 policy 本身沒有限制欄位,任何人查詢公開比賽主辦人的 `line_user_id`/`discord_user_id` 都查得到,即使前端從來沒用到這兩個值。
3. **修法**:Postgres 的欄位級 `GRANT`/`REVOKE`(RLS 完全不管欄位,要收緊欄位只能靠這個)。**踩坑記錄**:第一次用 `revoke select (line_user_id, discord_user_id) on profiles from anon, authenticated;` 完全沒生效,查證後才搞懂——Postgres 的欄位權限判斷是「table-level 授權 OR column-level 授權」,只要 table-level 還留著 blanket `grant select on profiles to anon, authenticated`(Supabase 建表預設會下這個),欄位級 REVOKE 完全不會限制到任何東西,必須先把 table-level 整個收回、再用 column-level GRANT 只重新開放安全欄位,兩者順序不能反。用一個臨時的 `SECURITY DEFINER` 診斷 function 直接查 `information_schema.column_privileges` 才確認修對了(這個 function 事後已刪除)。最終狀態:`authenticated` 對 `profiles` 的 UPDATE 只能碰 `display_name`/`avatar_url`/`bio`/`social_link`/`featured_track_url`/`host_setup_completed`,SELECT 排除 `line_user_id`/`discord_user_id`(這兩個目前全站沒有任何畫面需要顯示給使用者本人看,乾脆整個排除在 anon/authenticated 的欄位授權外,維持純 service_role-only 存取,模型更單純)。

### 已知缺口(這輪新產生的,不是漏了、是還沒排到)

- **「名次」還沒有資料可顯示**:`/u/[id]` 的參賽紀錄區塊目前固定顯示「名次功能開發中」,因為名次要等投票/評分系統(`votes`/`submission_scores`)把分數跑出來才有意義——見「下一步」第 1 項。
- **推薦曲目/YT embed 沒有做內容審核**:任何人貼什麼 YouTube 連結都會被嵌入播放,目前沒有防護(例如檢查是否為不當內容),風險等級低(YouTube iframe 本身受 YouTube 自己的內容政策管,不是 SoundArena 代管內容),暫不處理。
- **`AdminShell` 平台視角(全站比賽/檢舉處理)還是 mock 資料**,沒被這輪碰到,維持原狀。
