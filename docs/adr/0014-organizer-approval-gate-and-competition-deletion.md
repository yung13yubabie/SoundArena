# 主辦資格改為審核制,並新增比賽刪除功能

有人隨手完成主辦人設定、建立了一場測試比賽,結果發現整個站沒有任何清除機制。這暴露兩個問題:ADR-0010 當初選的「自助送出即完成」對這個情境太寬鬆,而且完全沒有「刪除比賽」這個功能——兩者都要處理。

## 決定一:主辦資格改為平台管理員審核制,反轉 ADR-0010

新增 `profiles.host_approved_at timestamptz`(null = 尚未審核通過)。使用者明確要求既有「已經自助通過」的主辦人帳號也要一起重新送審,不是只套用在未來新申請上——這點不需要額外寫「重置」邏輯,新欄位對所有既有 row 本來就是 null,直接等於全部變成待審核。

核心判斷 `is_competition_organizer()` 補上 `host_approved_at is not null` 這個條件,連帶所有依賴它的 RPC/policy(`can_manage_competition()` 一路往下)都自動套用,不用一一去改。建立新比賽的 `is_non_revoked_self()` 也一併補上同一個條件。新增 `approve_organizer_application()` RPC(平台管理員專用),`AdminShell` 的「主辦人管理」畫面拆成三欄:待審核(核准/駁回)、已核准(撤除)、已駁回或已撤除(重新賦予)——駁回直接重用既有的 `revoke_organizer()`,不用另外寫一支函式,「被駁回」與「被撤除」只是同一個 `host_revoked_at` 欄位在 `host_approved_at` 是否曾經被設過的不同呈現。

**部署當下抓到的死鎖**:被重置成待審核的帳號也包含平台管理員自己的主辦人身份。5 個 `/admin/*` 頁面原本的守門邏輯是「沒完成主辦設定或被撤除就導去 `/admin/profile`」,套用新條件後,平台管理員如果自己的主辦資格也還沒審核通過,會連 `/admin` 後台都進不去——沒有人進得去就沒有人能核准任何人(包含自己),形成死鎖。修法:5 個守門頁面都補上「平台管理員一律放行」的例外,不受自己的主辦審核狀態影響;平台管理員個人的比賽管理能力仍然照走一般規則(要嘛自己審核通過,要嘛透過已核准的協作者權限)。用真實測試帳號(一個待審核的一般主辦人、一個待審核的平台管理員)驗證過:一般待審核主辦人被 RPC 層擋下(包含直接打 PostgREST 繞過 UI 建立新比賽也被 RLS 擋)、平台管理員核准後該帳號立刻能管理自己既有的比賽。

## 決定二:新增比賽刪除功能,採草稿期自助刪

`delete_competition(p_competition_id)` RPC:草稿期(這場比賽還沒有任何 `registrations` row)主辦人本人可以自助刪除;一旦有真實報名紀錄,只有平台管理員能刪,避免主辦人單方面把參賽者的資料一起清掉。只開放給 Organizer 本人,不含 collaborator——這是不可逆的破壞性動作,不像 format/schedule/review 那些日常管理工作適合委派。平台管理員不受草稿期限制,任何狀態都能刪,並在「所有主辦人建立的比賽」清單裡加了對應的刪除按鈕(兩段式確認,不用瀏覽器原生 confirm)。`/admin/format` 也加了同樣兩段式確認的刪除區塊,刪除失敗(已有報名)會用清楚的中文訊息告知要找平台管理員,不是原始 DB 錯誤。

所有外鍵在 schema 裡本來就是 `on delete cascade`(rounds/registrations/submissions/votes/scoring_rules/round_format_blocks/competition_collaborators/notification_events 全部會跟著清掉),不需要另外處理。用真實測試帳號驗證過:草稿期比賽自助刪成功;已有報名的比賽自助刪被擋、平台管理員刪除成功;獨立 service_role 查詢確認資料真的消失。
