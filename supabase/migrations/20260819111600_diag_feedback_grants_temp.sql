create or replace function diag_list_feedback_grants()
returns table (grantee text, privilege_type text)
language sql security definer set search_path = public stable as $$
  select grantee, privilege_type from information_schema.role_table_grants
  where table_name = 'feedback' and table_schema = 'public';
$$;
grant execute on function diag_list_feedback_grants() to anon, authenticated;
