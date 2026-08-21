create or replace function diag_list_duplicate_overloads()
returns table(function_name text, overload_count bigint, signatures text)
language sql stable security definer set search_path = public as $$
  select p.proname::text,
    count(*)::bigint,
    string_agg(pg_get_function_identity_arguments(p.oid), ' || ' order by pg_get_function_identity_arguments(p.oid))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
  group by p.proname
  having count(*) > 1;
$$;

grant execute on function diag_list_duplicate_overloads() to authenticated;
