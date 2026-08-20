create or replace function diag_show_request_headers()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select current_setting('request.headers', true);
$$;

grant execute on function diag_show_request_headers() to authenticated;
