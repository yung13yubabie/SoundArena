-- 臨時診斷用:確認 profiles.UPDATE 的欄位權限收緊是否真的生效(SELECT 那次修了兩次才對,
-- 這裡直接查 information_schema 避免再猜一次)。下一個 migration 會把這個 function 砍掉。
create or replace function diag_profiles_grants()
returns table(grantee text, privilege_type text, column_name text)
language sql security definer set search_path = public as $$
  select grantee, privilege_type, column_name
  from information_schema.column_privileges
  where table_name = 'profiles' and grantee in ('anon', 'authenticated', 'public')
  order by grantee, privilege_type, column_name;
$$;
grant execute on function diag_profiles_grants() to anon;
