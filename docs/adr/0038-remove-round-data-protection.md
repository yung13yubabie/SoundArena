# ADR-0038:`remove_round()` 補上真實資料保護,順手發現它從未開放給 PlatformAdmin

ADR-0035(DB-08)查證 `delete_competition()` 時發現的相關問題:`remove_round()`(移除單一輪次)完全沒有檢查該輪是否已有真實投稿,只擋「不可移除第一輪或最後一輪」。跟使用者確認後(用 `mattpocock-skills:grilling` 逐項確認),決定比照 `delete_competition()` 的既有模式修復。

## 修法

`supabase/migrations/20260823010000_remove_round_data_protection.sql`——一般 organizer 只要這一輪已有真實投稿就完全擋下,PlatformAdmin 可在後台強制移除。輪次沒有直接掛 `registrations`(報名是比賽層級,不是輪次層級),所以檢查的是 `submissions` 而不是 `registrations`;`votes` 依附於 `submissions`,有真實投稿是有真實選票的必要條件,不需要另外查。

## 真實 PoC 抓到一個比預期更深的根因

第一版真實 PoC 就發現 PlatformAdmin 根本連檢查都到不了——`remove_round()` 最上層的權限檢查一路以來只看 `can_manage_competition()`(organizer 或 collaborator),從沒有 `is_platform_admin()` 的例外,跟 `delete_competition()` 的既有模式不一致。這不是這次新加的保護擋住的,是這支 RPC 從最初就沒開放給 PlatformAdmin。

Forward-fix(`20260823020000_remove_round_platform_admin_access.sql`):最上層權限檢查加上 `or is_platform_admin()`,PlatformAdmin 才能真正到達下面的資料保護邏輯,並且不受「已有真實投稿」的擋。首輪/末輪不可移除的規則對所有人(包含 PlatformAdmin)一律生效,不受這次修改影響。

## 驗證

一次性真實 PoC(6/6,對正式 Supabase 環境):一般 organizer 被擋下、沒有真實投稿的中間輪次仍可正常移除(回歸)、PlatformAdmin 可強制移除、首輪不可被任何人移除(含 PlatformAdmin)。`web/scripts/security-regression.mjs` 新增對應 3 項長期守護,`npm run test:security` 27/27 通過。`admin/format/actions.ts` 的 `removeRound()` 補上友善錯誤訊息。
