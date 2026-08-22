-- 真實 PoC 抓到 20260822120000 的 bug:新建立的 function 在 Postgres/Supabase 底下
-- 預設會隱含 GRANT EXECUTE 給 PUBLIC(因此 authenticated/anon 都繼承得到),跟這個
-- session 稍早在 table 層級踩過的坑是同一類——當時學到的是「REVOKE 要明確下給
-- public/authenticated/anon,不能假設沒明講就沒有」,這次在 function 層級又忘了
-- 套用同一條規則:只顧著 grant 給 service_role,沒有明確 revoke 掉預設的 PUBLIC
-- 授權,導致 authenticated 使用者事實上還是能直接呼叫 submit_entry(),DB-02 沒有
-- 真的被關掉。用 diag_submit_entry_acl() 診斷函式攤開 ACL 直接證實:authenticated/
-- anon/PUBLIC 三者都還握有 EXECUTE。

revoke execute on function submit_entry(uuid, uuid, uuid, text, text, text, text, text, boolean, text, text, boolean) from public, authenticated, anon;
