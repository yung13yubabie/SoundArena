-- 移除 20260822130000 的暫時診斷函式——已經用它抓到並確認修好 DB-02 的
-- PUBLIC 授權洩漏,診斷用途結束。

drop function if exists diag_submit_entry_acl();
