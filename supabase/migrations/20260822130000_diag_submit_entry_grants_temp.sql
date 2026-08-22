-- 暫時診斷用:直接查 pg_proc + aclexplode 攤開 submit_entry() 目前所有簽章版本
-- 的真實 ACL,不透過 PostgREST RPC 猜測。驗證完就會被下一個 migration 移除。

create or replace function diag_submit_entry_acl()
returns table(proname text, pronargs int, args text, grantee text, privilege text)
language sql security definer set search_path = public as $$
  select
    p.proname,
    p.pronargs,
    pg_get_function_identity_arguments(p.oid),
    coalesce(a.grantee::regrole::text, '(owner/implicit)'),
    a.privilege_type
  from pg_proc p
  left join lateral aclexplode(p.proacl) a on true
  where p.proname = 'submit_entry' and p.pronamespace = 'public'::regnamespace;
$$;
grant execute on function diag_submit_entry_acl() to service_role;
