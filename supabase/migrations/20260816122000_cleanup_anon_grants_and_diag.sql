-- authenticated 角色的欄位權限已確認正確(見上一輪診斷)。這裡收尾:
-- anon(未登入)完全不該有 UPDATE profiles 的能力——目前只是 RLS 擋著沒被利用,
-- 屬於縱深防禦,一併收掉;並移除純診斷用的 diag_profiles_grants function。

revoke update on profiles from anon;
revoke insert on profiles from anon, authenticated;

drop function if exists diag_profiles_grants();
