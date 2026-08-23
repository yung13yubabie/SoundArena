# ADR-0039:DB-09——時程加上時間精度、支援每輪獨立設定

Grilling 確認的兩件分開處理的工作,都在賽制/時程相關頁面。

## (a) 時程加上時間精度

`ScheduleForm.tsx` 所有欄位原本是 `type="date"`,只能精確到日。改成 `type="datetime-local"`,並新增 `web/src/lib/datetimeLocal.ts` 共用工具(`toDatetimeLocalInput`/`fromDatetimeLocalInput`/`formatLocalForDisplay`)——`datetime-local` 的 `value` 是沒有時區資訊的「牆上時鐘」字串,必須用瀏覽器自己的 `Date` 物件換算成正確帶時區的 ISO 字串再送給伺服器,否則 Postgres 會把它當成 UTC 解讀,造成時區換算錯誤。真實 PoC(Asia/Taipei 環境)驗證往返轉換分鐘級別一致、無時區偏移。分享訊息(`ShareMessagePanel`)跟驗證錯誤文案都改用 `formatLocalForDisplay()` 顯示本地時間,不直接顯示原始 datetime-local 字串。

## (b) 每輪獨立時程

多輪比賽的投稿/投票時間原本全部輪次共用同一組(`set_round_schedule_windows()` 一次套用到所有 round_id),沒辦法表達「兩輪之間有休息空檔」這種常見情境。

設計上沒有新增額外的「是否覆寫」欄位——`rounds` 表的 `submission_opens_at` 等 4 個欄位本來就是每輪各自的有效時程,新的 `set_round_schedule_override(p_round_id, ...)` RPC 跟既有的 `set_round_schedule_windows()`(賽制頁「時程設定」的整體套用)寫的是同一組欄位,誰後寫誰生效。這代表「不填就沿用整體時程」是自然成立的(沒碰過專屬設定,值就是整體套用的結果);但如果主辦人先設定某輪專屬時程、之後又跑一次「時程設定」頁的整體套用,會把那個專屬設定蓋掉——這是刻意的簡化,沒有另外做「鎖定不被覆蓋」的機制,UI 文案(`ScheduleForm.tsx`/`AdminFormatClient.tsx` 兩處)都提醒了這個行為。

`AdminFormatClient.tsx` 的 `RoundFormatCard` 新增可展開的「本輪專屬時程(選填)」面板,4 個 `datetime-local` 欄位,存檔呼叫新的 Server Action `setRoundScheduleOverride()`。

## 驗證

一次性真實 PoC(6/6,對正式 Supabase 環境):organizer 可設定自己輪次的專屬時程、沒設定的輪次不受影響、陌生人不能設定別人比賽的輪次、違反 `submission_window_valid` constraint 被 DB 擋下、清空(傳 null)正常成功。`security-regression.mjs` 新增 2 項長期守護(跨租戶隔離),29/29 通過。`tsc`/`eslint`/`build` 全程乾淨。
