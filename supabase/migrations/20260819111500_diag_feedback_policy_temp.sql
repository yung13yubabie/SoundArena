-- 診斷用,暫時的:意見回饋 insert 對真實使用者 token 回報 RLS 42501,查看正式環境
-- 實際生效的 policy 定義是不是跟 migration 檔案一致(懷疑 dashboard 手動改過)。
create or replace function diag_list_feedback_policies()
returns table (policyname text, cmd text, qual text, with_check text)
language sql security definer set search_path = public stable as $$
  select policyname, cmd, qual, with_check from pg_policies where tablename = 'feedback';
$$;
grant execute on function diag_list_feedback_policies() to anon, authenticated;
