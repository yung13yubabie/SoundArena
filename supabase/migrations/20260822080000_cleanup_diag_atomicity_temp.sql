-- 移除 20260822070000 的暫時診斷 function——已經用真實 PoC 驗證過
-- create_competition_full() 的交易原子性(故意在建輪次後失敗,確認連已成功 insert
-- 的 competition 都被完整回滾),診斷用途結束。

drop function if exists diag_create_competition_full_fail_after_rounds(text, text, boolean);
