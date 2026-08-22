-- 第三方稽核報告的 Anti-Slop 項目:competitions.anonymity_mode 從 ADR-0006
-- (20260817020000_per_round_anonymity.sql)就已經被自己的 migration 註記為
-- vestigial——AnonymityMode 從 Competition 層級三選一改成 Round 層級布林值
-- (rounds.is_anonymous)後,這個舊欄位不再被任何邏輯讀取。
--
-- 這次確認清除是安全的:
-- 1. `grep -rn anonymity_mode web/src` 全專案零引用。
-- 2. 目前生效的 round_identity_revealed()(20260817020000 建立的版本)跟
--    get_round_submissions()/get_round_scores()(20260817013000 建立的版本)都已
--    改用 rounds.is_anonymous,不讀 competitions.anonymity_mode——舊 migration 檔案
--    裡看到的 `v_anonymity anonymity_mode` 是被後面的 create or replace 取代掉的
--    歷史版本,不是現行邏輯。
-- 3. competitions 的 UPDATE 權限在 20260820040000 已經整個從 authenticated 收回
--    (改走 save_competition_schedule() 等專用 RPC),這個欄位連寫入路徑都不存在。

alter table competitions drop column anonymity_mode;
drop type anonymity_mode;
