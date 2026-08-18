-- ADR-0007:使用者要求整個拿掉 Report 機制,不只是藏 UI。上一輪(20260819020000)
-- 才剛補上 RLS,這輪直接砍掉整張表,不留一個沒有任何呼叫路徑會用到的半吊子狀態。

drop policy if exists "reports insertable by authenticated users" on reports;
drop policy if exists "reports readable by platform admin" on reports;
drop policy if exists "reports updatable by platform admin" on reports;

drop table if exists reports;
drop type if exists report_status;
