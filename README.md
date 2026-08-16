# 聲擂 SoundArena

AI 音樂比賽投票網站——支援 Suno 等 AI 音樂平台的創作者投稿、多輪賽制淘汰、匿名投票，並透過 LINE / Discord bot 發送賽事通知。

SoundArena 是開放多租戶平台：任何登入使用者都能自由建立比賽並成為該場比賽的主辦方（Organizer），不需要平台審核。

## 畫面預覽

| Discovery（比賽發現頁，不需登入） | 擂台（播放清單） |
| --- | --- |
| ![Discovery 比賽發現頁](docs/screenshots/discovery.jpg) | ![擂台播放清單](docs/screenshots/competitions.jpg) |

| 評審評分 | 賽制建立 |
| --- | --- |
| ![評審評分頁面](docs/screenshots/judge.jpg) | ![賽制建立頁面](docs/screenshots/format-builder.jpg) |

## 核心功能

- **開放多租戶**：任何使用者建立第一場比賽即自動成為 Organizer，管理自己的比賽；PlatformAdmin 處理跨比賽的檢舉
- **賽制積木系統**：淘汰方式、分組方式、特殊機制可自由組合成每一輪的賽制，不強制整場統一
- **評分機制**：加權計分項目（權重總和固定 100%）+ 額外加分項（不封頂），計算公式對所有人公開透明
- **匿名投票**：三種揭露時機可選（全程匿名／單輪匿名／全程公開），匿名階段的投稿清單每次讀取重新隨機排序
- **身份驗證**：投稿連結解析出的 Suno 帳號與報名帳號自動比對，不一致需人工放行
- **播放架構**：投稿者上傳音檔至私有儲存，播放時由後端動態簽發短效期網址，不使用第三方平台的直連網址

完整規格見 [SPEC.md](SPEC.md)，領域詞彙定義見 [CONTEXT.md](CONTEXT.md)，架構決策見 [docs/adr/](docs/adr/)。

## 技術棧

- **前端**：Next.js 16（App Router）+ TypeScript + Tailwind CSS v4，部署於 Vercel
- **後端**：Supabase（Auth + Postgres + Row Level Security）
- **音檔儲存**：Cloudflare R2
- **登入**：Google、Discord（LINE 尚未開通）

## 開發狀態

前端畫面（登入、報名、投稿、擂台、投票、評審評分、審核後台、賽制建立、時程設定、Discovery）已全數完成，Supabase schema 與 Google/Discord 登入已可運作。目前畫面仍使用假資料，尚未接上真實的比賽/投稿/投票讀寫。詳細進度見 [HANDOFF.md](HANDOFF.md)。

## 本地開發

```bash
cd web
npm install
npm run dev
```

需要在 `web/.env.local` 提供 Supabase 專案的 URL 與金鑰（不進版控，見 `web/.gitignore`）。
