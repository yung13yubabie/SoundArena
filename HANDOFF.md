# HANDOFF — 聲擂 SoundArena

> 寫給完全沒有上一輪對話記憶的新 session 看。這份文件是唯一的真相來源,不要假設你「應該知道」任何背景。
> 寫入時間:2026-08-16(對話跨了 08-09 ~ 08-16 多天,以下依實際完成順序整理,不是猜測)

---

## Git 狀態(08-16 已解決,新 session 不用重查)

SoundArena 現在有**自己獨立的 git repo**(`SoundArena/.git`,跟上層 `C:\Users\LIN\Documents\github` 那個沒有任何關係——那個上層 repo 是空的、zero commits,而且底下混了 `SUNOprompt`/`backend`/`lottery` 幾個不相關的專案資料夾,SoundArena 不用它)。

第一個 commit(`f604235`)已建立,涵蓋 08-09 ~ 08-16 累積的所有工作。**沒有設定遠端(GitHub)**,目前只有本機版本歷史。

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

### Next.js 真實骨架(`web/`,08-16 這輪把全部 11 個畫面都搬完了)

真的能動、不是佔位頁的路由:
- `/login`、`/register` — 真的接 Supabase Auth,`/register` 有 Server Component 層的登入 gate(未登入會被 `src/proxy.ts` 導回登入頁)
- `/`(Discovery)、`/competitions`(擂台+播放器)、`/submit`(投稿表單)、`/vote`(投票)、`/judge`(評審評分)、`/status`(個人狀態)、`/admin/review`(審核後台)、`/admin/format`(賽制建立)、`/admin/schedule`(時程設定)— 全部從 `design/prototype.html` 忠實搬過來,用 Tailwind 重寫,已用瀏覽器實測互動(播放器切歌、AdminShell 雙視角切換、檢舉標記已處理、時程邊界紅字警告都驗證過真的有效,不只是編譯過)

**已知缺口,不是漏了、是還沒排到**:
1. **這 11 個畫面全部還是假資料**(`src/lib/mockData.ts` + 各頁面內的 mock),沒有一個真的讀寫 Supabase 的 `competitions`/`submissions`/`votes` 等表。上面五張留白 RLS 的表也還沒有對應的後端寫入邏輯。
2. **`/admin/*` 目前沒有真的權限保護**——proxy.ts 只擋了 `/register` 這一條路徑,誰都能直接打網址進 `/admin/format` 等頁面。要等「使用者建立第一場比賽自動成為 Organizer」這個流程做出來、`profiles.is_platform_admin` 有實際用途,才能接上真的角色檢查。
3. **通知系統完全沒動**——SPEC 第 6 節已經把觸發時機寫完整(報名/投稿提醒/投稿完成/投票開始/晉級提醒投稿/淘汰結果/最終名次,全部要透過 UID 精準通知,不是廣播),也決定加 Email 管道(只有 Google 登入的人能收,LINE/Discord 使用者不提供這個選項)——但**沒有 schema、沒有寄信服務商**,純粹記在 SPEC 裡待實作。

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

1. **接真實資料**:把 11 個畫面從 mockData 換成真的 Supabase 讀寫——第一步通常是先做「建立比賽」的完整流程(對應 `/admin/format` + `/admin/schedule`),因為使用者要先能建立一場真的 Competition,其他畫面(報名/投稿/投票)才有東西可以接
2. **Discord guilds.join 補完**:使用者把 Bot 邀進 SoundArena Discord 伺服器,把伺服器 ID 填進 `DISCORD_GUILD_ID`
3. **`/admin/*` 真的權限保護**:等第 1 點的「建立比賽自動成為 Organizer」邏輯做出來後,一起把 proxy.ts 的 gate 擴大到 admin 路徑
4. **Cloudflare R2**:建 bucket、拿金鑰、接上音檔上傳/簽章下載
5. **通知系統**:先決定 schema(SPEC 第 6 節需求已經很完整了),再選 email 服務商
6. **LINE 登入**:使用者能申請的時候回來補
7. **补第一次 git commit**(看使用者要不要現在做,見文件最開頭)

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

---

## 使用者的協作偏好

- 有時會明講「不需要太多說明,只要簡單的」——收到這種訊號後,回覆盡量精簡。
- 偏好「先做完再回報」,不要每一步都停下來問,但**架構級的分岔決定**(平台定位、前端部署平台、音檔儲存廠商)一定要讓使用者自己選。這輪用 `AskUserQuestion` 問過:前端部署選 Vercel、音檔儲存選 Cloudflare R2、Email 管道先記需求不急著接。
- 對「靜默失敗」「空集合沒設計」特別敏感,SPEC.md 第 10 節已經寫成硬性規則。
- 喜歡追根究底查證技術限制,不接受用猜的回答——這輪查證過 Supabase LINE provider 是否存在、Google OAuth 同意畫面顯示網域的真正原因,都是先查證再回答,不是憑印象。
- 輸入常常很精簡/口語(例如「UIUX似乎還沒從本地搬運過來喔 完成他!」),需要自己判斷完整範圍再動手,不要照字面窄義解讀。
- 過程中會直接否決或修正我的建議、要求照他的方向做,正常收下,不用堅持己見。
